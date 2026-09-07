// FR-2/FR-3: 예약 상태 조회 (체크아웃 페이지의 홀드 만료 카운트다운 polling용, 설계문서 4-1 참고)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const { data: reservation, error } = await supabaseAdmin
        .from("reservations")
        .select(
            "id, status, check_in, check_out, guest_name, guest_count, total_price, hold_expire_at, refund_amount, room_type_id, room_types(name), rooms(name)"
        )
        .eq("id", id)
        .single();

    if (error || !reservation) {
        return NextResponse.json({ error: "NOT_FOUND", message: "예약을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ reservation });
}
