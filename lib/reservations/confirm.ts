import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ConfirmError = "NOT_FOUND" | "NOT_HOLD";

export type ConfirmResult =
    | { ok: true; alreadyConfirmed: boolean }
    | { ok: false; error: ConfirmError };

// FR-3 / FR-6: 결제 성공 웹훅에서 호출된다. lib/payments 구현체에 직접 의존하지 않고
// reservationId만 받아 상태를 전환하므로, 어떤 PG사를 붙이든 이 함수는 그대로 재사용된다.
// 웹훅 중복 수신에 대비해 이미 CONFIRMED인 경우 성공으로 취급한다(멱등성).
export async function confirmReservation(reservationId: string): Promise<ConfirmResult> {
    const { data: reservation } = await supabaseAdmin
        .from("reservations")
        .select("id, status")
        .eq("id", reservationId)
        .single();

    if (!reservation) {
        return { ok: false, error: "NOT_FOUND" };
    }

    if (reservation.status === "CONFIRMED") {
        return { ok: true, alreadyConfirmed: true };
    }

    if (reservation.status !== "HOLD") {
        // EXPIRED/CANCELLED 상태에서 뒤늦게 결제가 완료된 예외 케이스.
        // 호출부(completePayment, FR-6 AC2)가 이 결과를 보고 자동 환불을 트리거한다.
        return { ok: false, error: "NOT_HOLD" };
    }

    const { error, count } = await supabaseAdmin
        .from("reservations")
        .update(
            { status: "CONFIRMED", hold_expire_at: null, updated_at: new Date().toISOString() },
            { count: "exact" }
        )
        .eq("id", reservationId)
        .eq("status", "HOLD"); // 낙관적 동시성: 그 사이 상태가 바뀌었으면 0건 업데이트

    if (error) {
        throw new Error(error.message);
    }

    if (!count) {
        // update 순간 사이에 다른 요청이 먼저 상태를 바꾼 경우 -> 최신 상태 재조회
        return confirmReservation(reservationId);
    }

    return { ok: true, alreadyConfirmed: false };
}
