// 예약 캘린더(세로=객실, 가로=날짜) 전용 조회. GET /api/admin/reservations는 check_in이
// 조회 구간 안에 있는 건만 걸러서, 구간 시작 전에 체크인해 아직 안 끝난 숙박(구간과 겹치지만
// check_in은 구간 밖)을 놓친다 - 캘린더는 그런 숙박도 걸쳐서 보여줘야 하므로 겹침 기준으로 조회한다
// (room-types/[id]/availability/route.ts가 월별 가용성에 쓰는 것과 동일한 겹침 쿼리 패턴).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expireDueHolds } from "@/lib/reservations/expire";
import type { ReservationStatus } from "@/lib/reservations/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RESERVATION_COLUMNS = `
    id,
    room_id,
    guest_name,
    guest_phone,
    guest_email,
    check_in,
    check_out,
    status,
    source,
    total_price,
    refund_amount,
    cancel_reason,
    hold_expire_at,
    checked_in_at,
    checked_out_at,
    created_at,
    cancelled_at,
    room_types ( name ),
    rooms ( name ),
    reservation_addons ( quantity, price, addons ( name ) )
`;

// GET /api/admin/reservations의 addDaysToDateStr와 동일한 KST 보정 방식(날짜 문자열 기준 +N일).
function addDaysToDateStr(dateStr: string, delta: number) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + delta);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const includeCancelled = searchParams.get("include_cancelled") === "true";

    if (!dateFrom || !dateTo || !DATE_PATTERN.test(dateFrom) || !DATE_PATTERN.test(dateTo)) {
        return NextResponse.json(
            { error: "INVALID_DATE", message: "date_from/date_to는 YYYY-MM-DD 형식으로 모두 필요합니다." },
            { status: 400 }
        );
    }

    const statuses: ReservationStatus[] = includeCancelled
        ? ["HOLD", "CONFIRMED", "CANCELLED", "EXPIRED"]
        : ["HOLD", "CONFIRMED"];
    const rangeEndExclusive = addDaysToDateStr(dateTo, 1);

    // 목록을 보기 전에 기한이 지난 HOLD를 먼저 정리해서(다른 admin 목록 라우트와 동일 패턴)
    // 캘린더에 이미 만료된 결제대기 블록이 남아있지 않도록 한다.
    try {
        await expireDueHolds();
    } catch (err) {
        console.error("[GET /api/admin/calendar] expireDueHolds failed", err);
    }

    try {
        const [{ data: rooms, error: roomsError }, { data: reservations, error: reservationsError }] = await Promise.all([
            supabaseAdmin
                .from("rooms")
                .select("id, name, room_type_id, room_types ( name )")
                .eq("is_active", true)
                .order("created_at", { ascending: true }),
            supabaseAdmin
                .from("reservations")
                .select(RESERVATION_COLUMNS)
                .in("status", statuses)
                .lt("check_in", rangeEndExclusive)
                .gt("check_out", dateFrom)
                .order("check_in", { ascending: true }),
        ]);

        if (roomsError) throw new Error(roomsError.message);
        if (reservationsError) throw new Error(reservationsError.message);

        return NextResponse.json({ rooms: rooms ?? [], reservations: reservations ?? [] });
    } catch (err) {
        console.error("[GET /api/admin/calendar]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "캘린더 정보를 불러오지 못했습니다." },
            { status: 500 }
        );
    }
}
