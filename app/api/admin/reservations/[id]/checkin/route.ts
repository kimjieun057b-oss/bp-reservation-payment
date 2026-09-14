// 프런트 데스크 체크인 처리: PATCH로 처리(checked_in_at=now), DELETE로 취소(되돌리기).
// 결제가 끝나지 않은 예약(HOLD 등)은 체크인 대상이 아니므로 CONFIRMED 상태만 허용한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("id, status, checked_in_at")
        .eq("id", id)
        .single();

    if (fetchError || !reservation) {
        return NextResponse.json({ error: "NOT_FOUND", message: "예약을 찾을 수 없습니다." }, { status: 404 });
    }
    if (reservation.status !== "CONFIRMED") {
        return NextResponse.json(
            { error: "NOT_CONFIRMED", message: "결제 완료된 예약만 체크인할 수 있습니다." },
            { status: 409 }
        );
    }

    // 이미 체크인된 경우 중복 클릭으로 보고 그대로 현재 상태를 반환한다(에러 아님).
    if (reservation.checked_in_at) {
        return NextResponse.json({ ok: true, checked_in_at: reservation.checked_in_at });
    }

    const { data, error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_in_at: new Date().toISOString() })
        .eq("id", id)
        .select("checked_in_at")
        .single();

    if (error) {
        console.error("[PATCH /api/admin/reservations/:id/checkin]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크인 처리에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, checked_in_at: data.checked_in_at });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("id, checked_out_at")
        .eq("id", id)
        .single();

    if (fetchError || !reservation) {
        return NextResponse.json({ error: "NOT_FOUND", message: "예약을 찾을 수 없습니다." }, { status: 404 });
    }
    if (reservation.checked_out_at) {
        return NextResponse.json(
            { error: "ALREADY_CHECKED_OUT", message: "이미 체크아웃 처리된 예약입니다. 체크아웃을 먼저 취소해 주세요." },
            { status: 409 }
        );
    }

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_in_at: null })
        .eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/reservations/:id/checkin]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크인 취소에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
