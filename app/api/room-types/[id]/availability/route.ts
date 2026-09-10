// FR-1: 월 단위 예약 가능 여부 + 날짜별 요금 조회 (BookingCalendar가 사용)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { classifyDate, resolveNightlyPrice, toISODate, type PriceRule } from "@/lib/reservations/pricing";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getUTCFullYear());
    const month = Number(searchParams.get("month") ?? now.getUTCMonth() + 1); // 1~12

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return NextResponse.json(
            { error: "INVALID_PARAMS", message: "year/month 파라미터를 확인해주세요." },
            { status: 400 }
        );
    }

    const { data: roomType, error: roomTypeError } = await supabaseAdmin
        .from("room_types")
        .select("id, name, base_price, capacity_standard, capacity_max, property_id")
        .eq("id", id)
        .eq("is_active", true)
        .single();

    if (roomTypeError || !roomType) {
        return NextResponse.json(
            { error: "ROOM_TYPE_NOT_FOUND", message: "존재하지 않거나 비활성화된 객실 타입입니다." },
            { status: 404 }
        );
    }

    // FR-4 AC2: 예약 신청 전에 환불 규정을 미리 안내하기 위해 함께 내려준다 (days_before 내림차순).
    const { data: refundPolicies } = await supabaseAdmin
        .from("refund_policies")
        .select("days_before, refund_percent")
        .eq("property_id", roomType.property_id)
        .order("days_before", { ascending: false });

    const { count: totalRooms } = await supabaseAdmin
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("room_type_id", id)
        .eq("is_active", true);

    const { data: rules } = await supabaseAdmin
        .from("price_rules")
        .select("start_date, end_date, days_of_week, price, priority")
        .eq("room_type_id", id);

    const priceRules = (rules ?? []) as PriceRule[];

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExclusive = new Date(Date.UTC(year, month, 1)); // 다음달 1일

    // 이 달과 겹치는 예약만 가져와서(overlap) 날짜별 예약 수를 직접 센다.
    const { data: reservations } = await supabaseAdmin
        .from("reservations")
        .select("check_in, check_out")
        .eq("room_type_id", id)
        .in("status", ["HOLD", "CONFIRMED"])
        .lt("check_in", toISODate(monthEndExclusive))
        .gt("check_out", toISODate(monthStart));

    const days = [];
    const cursor = new Date(monthStart);

    while (cursor < monthEndExclusive) {
        const iso = toISODate(cursor);
        const bookedCount = (reservations ?? []).filter(
            (r) => r.check_in <= iso && iso < r.check_out
        ).length;
        const { isPeak, isWeekend } = classifyDate(cursor, priceRules);

        days.push({
            date: iso,
            available: (totalRooms ?? 0) > bookedCount,
            isPeak,
            isWeekend,
            price: resolveNightlyPrice(cursor, roomType.base_price, priceRules),
        });

        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return NextResponse.json({
        room_type: roomType,
        total_rooms: totalRooms ?? 0,
        days,
        refund_policies: refundPolicies ?? [],
    });
}
