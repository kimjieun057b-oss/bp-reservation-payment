import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { confirmReservation } from "./confirm";

export type ConfirmPhoneBookingError = "NOT_FOUND" | "NOT_PHONE_HOLD";
export type ConfirmPhoneBookingResult = { ok: true } | { ok: false; error: ConfirmPhoneBookingError };

// 전화 예약(계좌이체 확인 후) 수동 확정: HOLD -> CONFIRMED로 바꾸고, PG 결제를 거치지 않았음을
// 표시하는 payments 행(pg_provider='MANUAL')을 남긴다. cancelReservation()이 이 표식을 보고
// 취소 시 실제 PG 환불 API를 호출하지 않도록 한다. 온라인 결제대기(ONLINE) 건은 고객의 결제를
// 기다려야 하는 영역이라 이 경로로 강제 확정할 수 없다.
export async function confirmPhoneBooking(reservationId: string): Promise<ConfirmPhoneBookingResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status, source, total_price")
        .eq("id", reservationId)
        .single();

    if (!reservation) {
        return { ok: false, error: "NOT_FOUND" };
    }

    if (reservation.status !== "HOLD" || reservation.source !== "PHONE") {
        return { ok: false, error: "NOT_PHONE_HOLD" };
    }

    const result = await confirmReservation(reservationId);
    if (!result.ok) {
        return { ok: false, error: "NOT_PHONE_HOLD" };
    }

    const { error } = await supabaseAdmin.from("payments").insert({
        reservation_id: reservationId,
        order_id: `MANUAL-${reservationId}`,
        pg_provider: "MANUAL",
        amount: reservation.total_price,
        status: "PAID",
        method: "계좌이체",
        paid_at: new Date().toISOString(),
    });

    if (error) {
        throw new Error(error.message);
    }

    return { ok: true };
}
