// 프런트 데스크 체크아웃 처리: PATCH로 처리(checked_out_at=now), DELETE로 취소(되돌리기).
// 체크인이 먼저 되어 있어야만 체크아웃할 수 있다(현장에 없는 손님을 체크아웃 처리하는 실수 방지).
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
        .select("id, status, checked_in_at, checked_out_at")
        .eq("id", id)
        .single();

    if (fetchError || !reservation) {
        return NextResponse.json({ error: "NOT_FOUND", message: "예약을 찾을 수 없습니다." }, { status: 404 });
    }
    if (reservation.status !== "CONFIRMED") {
        return NextResponse.json(
            { error: "NOT_CONFIRMED", message: "결제 완료된 예약만 체크아웃할 수 있습니다." },
            { status: 409 }
        );
    }
    if (!reservation.checked_in_at) {
        return NextResponse.json(
            { error: "NOT_CHECKED_IN", message: "체크인되지 않은 예약은 체크아웃할 수 없습니다." },
            { status: 409 }
        );
    }

    // 이미 체크아웃된 경우 중복 클릭으로 보고 그대로 현재 상태를 반환한다(에러 아님).
    if (reservation.checked_out_at) {
        return NextResponse.json({ ok: true, checked_out_at: reservation.checked_out_at });
    }

    const { data, error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("id", id)
        .select("checked_out_at")
        .single();

    if (error) {
        console.error("[PATCH /api/admin/reservations/:id/checkout]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크아웃 처리에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, checked_out_at: data.checked_out_at });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabaseAdmin
        .from("reservations")
        .update({ checked_out_at: null })
        .eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/reservations/:id/checkout]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크아웃 취소에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
