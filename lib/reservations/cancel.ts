import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { daysUntil, resolveRefundPercent } from "./refund";

export type ReleaseHoldError = "NOT_FOUND" | "NOT_HOLD";
export type ReleaseHoldResult = { ok: true } | { ok: false; error: ReleaseHoldError };

// DELETE /reservations/:id/hold: 결제 전 홀드를 고객이 직접 해제하는 경우. 결제된 금액이 없으므로 환불 계산이 필요없다.
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

export type CancelError = "NOT_FOUND" | "NOT_CANCELLABLE";
export type CancelResult =
    | { ok: true; refundPercent: number; refundAmount: number }
    | { ok: false; error: CancelError };

// POST /reservations/:id/cancel: 결제 완료(CONFIRMED)된 예약의 고객/관리자 취소.
// FR-4/FR-7, DEC-002: refund_policies 테이블 기준으로 환불액을 자동 계산해 사전 안내한다.
// 이 함수는 계산과 상태 전환까지만 담당하고, 실제 PG 환불 API 호출은 lib/payments 연동 시(M3) 이 결과값으로 트리거한다.
export async function cancelReservation(
    reservationId: string,
    reason?: string
): Promise<CancelResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, check_in, total_price, property_id")
        .eq("id", reservationId)
        .single();

    if (!reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.status !== "CONFIRMED") return { ok: false, error: "NOT_CANCELLABLE" };

    const { data: policies, error: policiesError } = await supabaseAdmin
        .from("refund_policies")
        .select("days_before, refund_percent")
        .eq("property_id", reservation.property_id);

    if (policiesError) throw new Error(policiesError.message);

    const remainingDays = daysUntil(reservation.check_in);
    const refundPercent = resolveRefundPercent(remainingDays, policies ?? []);
    const refundAmount = Math.floor((reservation.total_price * refundPercent) / 100);

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({
            status: "CANCELLED",
            cancelled_at: new Date().toISOString(),
            cancel_reason: reason ?? null,
            refund_amount: refundAmount,
            updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId)
        .eq("status", "CONFIRMED");

    if (error) throw new Error(error.message);

    return { ok: true, refundPercent, refundAmount };
}
