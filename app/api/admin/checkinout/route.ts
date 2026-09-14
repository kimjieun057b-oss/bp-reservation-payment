// 프런트 데스크 체크인/체크아웃 보드: 결제가 끝난(CONFIRMED) 예약 중
// 지정한 날짜에 체크인 또는 체크아웃 예정인 건만 뽑아서 보여준다(설계 논의: 체크인/체크아웃 페이지 분리).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toISODate } from "@/lib/reservations/pricing";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_COLUMNS = `
    id,
    guest_name,
    guest_phone,
    guest_count,
    check_in,
    check_out,
    checked_in_at,
    checked_out_at,
    room_types ( name ),
    rooms ( name )
`;

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || toISODate(new Date());

    if (!DATE_PATTERN.test(date)) {
        return NextResponse.json({ error: "INVALID_DATE", message: "date는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
    }

    const [arrivalsResult, departuresResult] = await Promise.all([
        supabaseAdmin
            .from("reservations")
            .select(SELECT_COLUMNS)
            .eq("status", "CONFIRMED")
            .eq("check_in", date)
            .order("guest_name", { ascending: true }),
        supabaseAdmin
            .from("reservations")
            .select(SELECT_COLUMNS)
            .eq("status", "CONFIRMED")
            .eq("check_out", date)
            .order("guest_name", { ascending: true }),
    ]);

    if (arrivalsResult.error || departuresResult.error) {
        console.error(
            "[GET /api/admin/checkinout]",
            arrivalsResult.error?.message || departuresResult.error?.message
        );
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크인/체크아웃 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({
        date,
        arrivals: arrivalsResult.data ?? [],
        departures: departuresResult.data ?? [],
    });
}
