import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PaymentProvider } from "@/lib/payments/PaymentProvider";
import { confirmReservation } from "./confirm";

export type CreatePaymentIntentError = "NOT_FOUND" | "NOT_HOLD" | "HOLD_EXPIRED";

export interface PaymentIntent {
    orderId: string;
    amount: number;
    orderName: string;
}

export type CreatePaymentIntentResult =
    | { ok: true; intent: PaymentIntent }
    | { ok: false; error: CreatePaymentIntentError };

// FR-5/FR-6: 고객이 "결제하기"를 누른 시점에 PG 결제창을 띄우기 전, payments 테이블에 READY 상태 row를 먼저 만들어 order_id를 발급한다.
// 로직 검증 순서 : 존재 여부 > hold 상태 확인 > hold 만료되었는지
// 이후 lib/payments의 PaymentProvider 구현체가 이 order_id로 결제를 요청하고,
// 웹훅은 order_id(UNIQUE)로 조회해 멱등성을 보장한다(FR-6).
export async function createPaymentIntent(reservationId: string): Promise<CreatePaymentIntentResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, total_price, hold_expire_at, room_types(name)")
        .eq("id", reservationId)
        .single();

    if (!reservation) {
        return { ok: false, error: "NOT_FOUND" };
    }

    if (reservation.status !== "HOLD") {
        return { ok: false, error: "NOT_HOLD" };
    }

    // 만료 배치(Cron)가 아직 상태를 EXPIRED로 돌리기 전이라도, 시간상 이미 지난 홀드로는
    // 새 결제를 시작시키지 않는다.
    if (reservation.hold_expire_at && new Date(reservation.hold_expire_at).getTime() <= Date.now()) {
        return { ok: false, error: "HOLD_EXPIRED" };
    }

    const orderId = `res_${reservationId}_${Date.now()}`;
    const roomTypeName = reservation.room_types?.[0]?.name ?? "객실";

    const { error } = await supabaseAdmin.from("payments").insert({
        reservation_id: reservationId,
        order_id: orderId,
        pg_provider: "toss",
        amount: reservation.total_price,
        status: "READY",
    });

    if (error) {
        throw new Error(error.message);
    }

    return {
        ok: true,
        intent: {
            orderId,
            amount: reservation.total_price,
            orderName: `${roomTypeName} 예약`,
        },
    };
}

export type CompletePaymentError =
    | "PAYMENT_NOT_FOUND"
    | "RESERVATION_MISMATCH"
    | "NOT_PAID"
    | "RESERVATION_NOT_FOUND"
    | "HOLD_EXPIRED_REFUNDED";

export type CompletePaymentResult =
    | { ok: true; alreadyConfirmed: boolean }
    | { ok: false; error: CompletePaymentError };

// FR-6 AC2: 홀드가 이미 만료(EXPIRED)되었거나 취소된 뒤에 결제가 뒤늦게 완료된 예외 케이스.
// 예약을 확정시킬 수 없으므로 실제로 PG에 결제된 금액을 그대로 자동 환불한다.
// orderId(=payments.order_id)는 completePayment가 이미 조회해둔 값을 그대로 재사용한다.
async function refundExpiredPayment(
    payment: { id: string; reservation_id: string; amount: number },
    orderId: string,
    provider: PaymentProvider
): Promise<void> {
    await provider.refund({
        orderId,
        amount: payment.amount,
        reason: "홀드 만료 후 결제 완료 - 자동 환불",
    });

    await supabaseAdmin
        .from("payments")
        .update({ status: "REFUNDED" })
        .eq("id", payment.id)
        .eq("status", "PAID"); // 낙관적 동시성: 이미 처리된 중복 호출이면 건너뛴다

    await supabaseAdmin
        .from("reservations")
        .update({ refund_amount: payment.amount, updated_at: new Date().toISOString() })
        .eq("id", payment.reservation_id);
}

// FR-6: PG 결제 결과를 서버에서 재검증한 뒤 예약을 확정한다.
// 브라우저에서 받은 결제 성공 응답과 PG 웹훅 양쪽에서 모두 호출될 수 있으므로,
// order_id 단위로 멱등하게 동작한다(둘 중 먼저 처리된 쪽 결과를 그대로 성공 취급).
// PaymentProvider는 인터페이스로만 주입받아, lib/reservations가 특정 PG 구현체에 직접 의존하지 않게 한다.
export async function completePayment(
    orderId: string,
    provider: PaymentProvider,
    reservationId?: string
): Promise<CompletePaymentResult> {
    const { data: payment } = await supabaseAdmin
        .from("payments")
        .select("id, reservation_id, amount, status")
        .eq("order_id", orderId)
        .single();

    if (!payment) {
        return { ok: false, error: "PAYMENT_NOT_FOUND" };
    }

    if (reservationId && payment.reservation_id !== reservationId) {
        return { ok: false, error: "RESERVATION_MISMATCH" };
    }

    if (payment.status === "PAID") {
        const confirmResult = await confirmReservation(payment.reservation_id);

        if (confirmResult.ok) {
            return { ok: true, alreadyConfirmed: true };
        }

        if (confirmResult.error === "NOT_HOLD") {
            await refundExpiredPayment(payment, orderId, provider);
            return { ok: false, error: "HOLD_EXPIRED_REFUNDED" };
        }

        return { ok: false, error: "RESERVATION_NOT_FOUND" };
    }

    const verified = await provider.verifyPayment(orderId);

    if (verified.status !== "PAID") {
        return { ok: false, error: "NOT_PAID" };
    }

    if (verified.amount !== payment.amount) {
        // 클라이언트/PG 측 금액 위변조 의심 -> 자동 확정하지 않고 예외로 남겨 운영자가 확인하게 한다.
        throw new Error(
            `결제 금액 불일치: reservation payments.amount=${payment.amount}, PG verified amount=${verified.amount}`
        );
    }

    const { error } = await supabaseAdmin
        .from("payments")
        .update({
            status: "PAID",
            method: verified.method ?? null,
            paid_at: new Date().toISOString(),
            pg_transaction_id: verified.pgTransactionId ?? null,
            raw_response: verified.raw,
        })
        .eq("order_id", orderId)
        .eq("status", "READY"); // 낙관적 동시성: 웹훅/클라이언트 중 먼저 도착한 요청만 반영

    if (error) {
        throw new Error(error.message);
    }

    const confirmResult = await confirmReservation(payment.reservation_id);

    if (!confirmResult.ok) {
        if (confirmResult.error === "NOT_HOLD") {
            await refundExpiredPayment(payment, orderId, provider);
            return { ok: false, error: "HOLD_EXPIRED_REFUNDED" };
        }

        return { ok: false, error: "RESERVATION_NOT_FOUND" };
    }

    return { ok: true, alreadyConfirmed: confirmResult.alreadyConfirmed };
}
