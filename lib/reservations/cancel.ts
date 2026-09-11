import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { PaymentProvider } from "@/lib/payments/PaymentProvider";
import { daysUntil, resolveRefundPercent } from "./refund";

export interface GuestIdentity {
    name: string;
    phone: string;
}

const normalizePhone = (value: string) => value.replace(/\D/g, "");

// 비회원 예약이라 로그인 세션이 없으므로, 조회(lookup) 때와 동일하게 예약자명+전화번호가
// DB 레코드와 일치하는지로 "이 요청자가 예약 소유자인지"만 확인한다 (실명 본인인증 아님, PG/외부 API 불필요).
function isGuestOwner(
    reservation: { guest_name: string; guest_phone: string },
    guest: GuestIdentity
): boolean {
    return (
        reservation.guest_name === guest.name.trim() &&
        normalizePhone(reservation.guest_phone) === normalizePhone(guest.phone)
    );
}

export type ReleaseHoldError = "NOT_FOUND" | "NOT_HOLD" | "GUEST_MISMATCH";
export type ReleaseHoldResult = { ok: true } | { ok: false; error: ReleaseHoldError };

// DELETE /reservations/:id/hold: 결제 전 홀드를 고객이 직접 해제하는 경우. 결제된 금액이 없으므로 환불 계산이 필요없다.
// EXPIRED는 hold_expire_at 시간 초과로 인한 "자동" 만료(expireDueHolds)에만 쓰고,
// 이 경로처럼 사용자가 직접 취소 버튼을 눌러 능동적으로 끝낸 경우는 결제 전/후 여부와 무관하게 CANCELLED로 남긴다.
// guest는 선택 인자다: 결제 전 HOLD는 돈이 오가지 않아 소유자 검증의 실익이 적고, /checkout/:reservationId
// 페이지는 예약 생성 직후 같은 세션에서 곧바로 접근하는 흐름이라 이름/전화번호를 다시 물어볼 입력창이 없다
// (DEC-006 갱신). 값이 전달된 경우(예: 예약 조회 화면에서 홀드 해제)에는 그래도 일치 여부를 검증한다.
export async function releaseHold(
    reservationId: string,
    guest?: GuestIdentity
): Promise<ReleaseHoldResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, guest_name, guest_phone")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (guest && !isGuestOwner(reservation, guest)) return { ok: false, error: "GUEST_MISMATCH" };
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

export type RefundPreviewError = "NOT_FOUND" | "NOT_CANCELLABLE" | "GUEST_MISMATCH";
export type RefundPreviewResult =
    | { ok: true; refundPercent: number; refundAmount: number; totalPrice: number }
    | { ok: false; error: RefundPreviewError };

// GET /reservations/:id/cancel: 실제로 취소하기 전에 환불 규정 기준 예상 환불액을 미리 보여주기 위한 조회 전용 함수.
// 상태를 변경하지 않으며, PG 환불도 호출하지 않는다. 예약 소유자가 아니면 예상 환불액(금액 정보)도 보여주지 않는다.
export async function previewRefund(
    reservationId: string,
    guest: GuestIdentity
): Promise<RefundPreviewResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, check_in, total_price, property_id, guest_name, guest_phone")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (!isGuestOwner(reservation, guest)) return { ok: false, error: "GUEST_MISMATCH" };
    if (reservation.status !== "CONFIRMED") return { ok: false, error: "NOT_CANCELLABLE" };

    const { refundPercent, refundAmount } = await calculatePolicyRefund(reservation);

    return { ok: true, refundPercent, refundAmount, totalPrice: reservation.total_price };
}

export type CancelError =
    | "NOT_FOUND"
    | "NOT_CANCELLABLE"
    | "PAYMENT_NOT_FOUND"
    | "INVALID_OVERRIDE_AMOUNT"
    | "GUEST_MISMATCH";
export type CancelResult =
    | { ok: true; refundPercent: number | null; refundAmount: number }
    | { ok: false; error: CancelError };

export interface CancelOptions {
    reason?: string;
    // FR-7 AC2: 관리자가 환불 규정과 다른 금액으로 수동 환불하는 예외 경로. 지정 시 정책 계산을 건너뛰고 이 금액을 그대로 사용한다.
    overrideRefundAmount?: number;
    // 고객이 직접 취소하는 경로(POST /reservations/:id/cancel)에서만 전달.
    // 지정하면 예약자명+전화번호가 DB 레코드와 일치할 때만 취소를 진행한다.
    // 관리자 취소(PATCH /admin/.../cancel)는 Supabase Auth 세션으로 이미 인증되므로 전달하지 않는다.
    verifyGuest?: GuestIdentity;
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
        .select("id, status, check_in, total_price, property_id, guest_name, guest_phone")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (options.verifyGuest && !isGuestOwner(reservation, options.verifyGuest)) {
        return { ok: false, error: "GUEST_MISMATCH" };
    }
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
