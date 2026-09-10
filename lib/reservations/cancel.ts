import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PaymentProvider } from "@/lib/payments/PaymentProvider";
import { daysUntil, resolveRefundPercent } from "./refund";

export type ReleaseHoldError = "NOT_FOUND" | "NOT_HOLD";
export type ReleaseHoldResult = { ok: true } | { ok: false; error: ReleaseHoldError };

// DELETE /reservations/:id/hold: 결제 전 홀드를 고객이 직접 해제하는 경우. 결제된 금액이 없으므로 환불 계산이 필요없다.
// EXPIRED는 hold_expire_at 시간 초과로 인한 "자동" 만료(expireDueHolds)에만 쓰고,
// 이 경로처럼 사용자가 직접 취소 버튼을 눌러 능동적으로 끝낸 경우는 결제 전/후 여부와 무관하게 CANCELLED로 남긴다.
export async function releaseHold(reservationId: string): Promise<ReleaseHoldResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.status !== "HOLD") return { ok: false, error: "NOT_HOLD" };

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({
            status: "CANCELLED",
            cancelled_at: new Date().toISOString(),
            cancel_reason: "고객 홀드 취소",
            updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId)
        .eq("status", "HOLD");

    if (error) throw new Error(error.message);

    return { ok: true };
}

// refund_policies 기준으로 정책상 환불율/환불액을 계산한다 (DEC-002). previewRefund와 cancelReservation이 공유한다.
async function calculatePolicyRefund(reservation: {
    check_in: string;
    total_price: number;
    property_id: string;
}): Promise<{ refundPercent: number; refundAmount: number }> {
    const { data: policies, error: policiesError } = await supabaseAdmin
        .from("refund_policies")
        .select("days_before, refund_percent")
        .eq("property_id", reservation.property_id);

    if (policiesError) throw new Error(policiesError.message);

    const remainingDays = daysUntil(reservation.check_in);
    const refundPercent = resolveRefundPercent(remainingDays, policies ?? []);
    const refundAmount = Math.floor((reservation.total_price * refundPercent) / 100);

    return { refundPercent, refundAmount };
}

export type RefundPreviewError = "NOT_FOUND" | "NOT_CANCELLABLE";
export type RefundPreviewResult =
    | { ok: true; refundPercent: number; refundAmount: number; totalPrice: number }
    | { ok: false; error: RefundPreviewError };

// GET /reservations/:id/cancel: 실제로 취소하기 전에 환불 규정 기준 예상 환불액을 미리 보여주기 위한 조회 전용 함수.
// 상태를 변경하지 않으며, PG 환불도 호출하지 않는다.
export async function previewRefund(reservationId: string): Promise<RefundPreviewResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, check_in, total_price, property_id")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.status !== "CONFIRMED") return { ok: false, error: "NOT_CANCELLABLE" };

    const { refundPercent, refundAmount } = await calculatePolicyRefund(reservation);

    return { ok: true, refundPercent, refundAmount, totalPrice: reservation.total_price };
}

export type CancelError =
    | "NOT_FOUND"
    | "NOT_CANCELLABLE"
    | "PAYMENT_NOT_FOUND"
    | "INVALID_OVERRIDE_AMOUNT";
export type CancelResult =
    | { ok: true; refundPercent: number | null; refundAmount: number }
    | { ok: false; error: CancelError };

export interface CancelOptions {
    reason?: string;
    // FR-7 AC2: 관리자가 환불 규정과 다른 금액으로 수동 환불하는 예외 경로. 지정 시 정책 계산을 건너뛰고 이 금액을 그대로 사용한다.
    overrideRefundAmount?: number;
}

// POST /reservations/:id/cancel, PATCH /admin/reservations/:id/cancel: 결제 완료(CONFIRMED)된 예약의 고객/관리자 취소.
// FR-4/FR-7, DEC-002: refund_policies 테이블 기준으로 환불액을 자동 계산하고, PaymentProvider를 통해 PG 환불까지 실제로 트리거한다.
// completePayment와 동일하게 provider는 인터페이스로만 주입받아 lib/reservations가 특정 PG 구현체에 의존하지 않는다(FR-5).
export async function cancelReservation(
    reservationId: string,
    provider: PaymentProvider,
    options: CancelOptions = {}
): Promise<CancelResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, check_in, total_price, property_id")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.status !== "CONFIRMED") return { ok: false, error: "NOT_CANCELLABLE" };

    const { data: payment, error: paymentError } = await supabaseAdmin
        .from("payments")
        .select("id, order_id, amount, status")
        .eq("reservation_id", reservationId)
        .eq("status", "PAID")
        .single();

    if (paymentError || !payment) return { ok: false, error: "PAYMENT_NOT_FOUND" };

    let refundPercent: number | null = null;
    let refundAmount: number;

    if (options.overrideRefundAmount !== undefined) {
        if (
            !Number.isInteger(options.overrideRefundAmount) ||
            options.overrideRefundAmount < 0 ||
            options.overrideRefundAmount > payment.amount
        ) {
            return { ok: false, error: "INVALID_OVERRIDE_AMOUNT" };
        }
        refundAmount = options.overrideRefundAmount;
    } else {
        const policyResult = await calculatePolicyRefund(reservation);
        refundPercent = policyResult.refundPercent;
        refundAmount = Math.min(policyResult.refundAmount, payment.amount);
    }

    // PG 환불은 실제로 돈이 움직이므로 먼저 성공시킨 뒤 DB 상태를 반영한다.
    if (refundAmount > 0) {
        await provider.refund({
            orderId: payment.order_id,
            amount: refundAmount,
            reason: options.reason ?? "예약 취소",
        });
    }

    const paymentStatus =
        refundAmount === 0 ? "CANCELLED" : refundAmount === payment.amount ? "REFUNDED" : "PARTIAL_REFUNDED";

    const { error: paymentUpdateError } = await supabaseAdmin
        .from("payments")
        .update({ status: paymentStatus })
        .eq("id", payment.id)
        .eq("status", "PAID");

    if (paymentUpdateError) throw new Error(paymentUpdateError.message);

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({
            status: "CANCELLED",
            cancelled_at: new Date().toISOString(),
            cancel_reason: options.reason ?? null,
            refund_amount: refundAmount,
            updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId)
        .eq("status", "CONFIRMED");

    if (error) throw new Error(error.message);

    return { ok: true, refundPercent, refundAmount };
}
