import { supabaseAdmin } from "@/lib/supabaseAdmin";

// 프런트 데스크 체크인/체크아웃 처리. 결제 완료(CONFIRMED)된 예약만 대상이며,
// 순서는 CONFIRMED → 체크인(checked_in_at) → 체크아웃(checked_out_at)이다.
// 체크아웃은 체크인이 선행되어야 하므로(checkOut의 NOT_CHECKED_IN 검사),
// 되돌리기(undoCheckIn)는 "체크아웃 없이 체크인만 취소"해서 이 순서를 거스르지 않도록
// 이미 체크아웃된 예약이면 막는다. 네 함수를 한 파일에 모아 이 상호 의존 관계가
// 파일이 갈리면서 한쪽만 수정되는 일이 없도록 한다.

export type CheckInError = "NOT_FOUND" | "NOT_CONFIRMED";
export type CheckInResult = { ok: true; checkedInAt: string } | { ok: false; error: CheckInError };

export async function checkIn(reservationId: string): Promise<CheckInResult> {
    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("id, status, checked_in_at")
        .eq("id", reservationId)
        .single();

    if (fetchError || !reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.status !== "CONFIRMED") return { ok: false, error: "NOT_CONFIRMED" };

    // 이미 체크인된 경우 중복 클릭으로 보고 그대로 현재 상태를 반환한다(에러 아님).
    if (reservation.checked_in_at) {
        return { ok: true, checkedInAt: reservation.checked_in_at };
    }

    const { data, error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_in_at: new Date().toISOString() })
        .eq("id", reservationId)
        .select("checked_in_at")
        .single();

    if (error) throw new Error(error.message);

    return { ok: true, checkedInAt: data.checked_in_at };
}

export type UndoCheckInError = "NOT_FOUND" | "ALREADY_CHECKED_OUT";
export type UndoCheckInResult = { ok: true } | { ok: false; error: UndoCheckInError };

export async function undoCheckIn(reservationId: string): Promise<UndoCheckInResult> {
    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("id, checked_out_at")
        .eq("id", reservationId)
        .single();

    if (fetchError || !reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.checked_out_at) return { ok: false, error: "ALREADY_CHECKED_OUT" };

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_in_at: null })
        .eq("id", reservationId);

    if (error) throw new Error(error.message);

    return { ok: true };
}

export type CheckOutError = "NOT_FOUND" | "NOT_CONFIRMED" | "NOT_CHECKED_IN";
export type CheckOutResult = { ok: true; checkedOutAt: string } | { ok: false; error: CheckOutError };

export async function checkOut(reservationId: string): Promise<CheckOutResult> {
    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("id, status, checked_in_at, checked_out_at")
        .eq("id", reservationId)
        .single();

    if (fetchError || !reservation) return { ok: false, error: "NOT_FOUND" };
    if (reservation.status !== "CONFIRMED") return { ok: false, error: "NOT_CONFIRMED" };
    if (!reservation.checked_in_at) return { ok: false, error: "NOT_CHECKED_IN" };

    // 이미 체크아웃된 경우 중복 클릭으로 보고 그대로 현재 상태를 반환한다(에러 아님).
    if (reservation.checked_out_at) {
        return { ok: true, checkedOutAt: reservation.checked_out_at };
    }

    const { data, error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("id", reservationId)
        .select("checked_out_at")
        .single();

    if (error) throw new Error(error.message);

    return { ok: true, checkedOutAt: data.checked_out_at };
}

export type UndoCheckOutError = "NOT_FOUND";
export type UndoCheckOutResult = { ok: true } | { ok: false; error: UndoCheckOutError };

// 예약 존재 확인 (404) 로직 
export async function undoCheckOut(reservationId: string): Promise<UndoCheckOutResult> {
    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("id")
        .eq("id", reservationId)
        .single();

    if (fetchError || !reservation) return { ok: false, error: "NOT_FOUND" };

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_out_at: null })
        .eq("id", reservationId);

    if (error) throw new Error(error.message);

    return { ok: true };
}
