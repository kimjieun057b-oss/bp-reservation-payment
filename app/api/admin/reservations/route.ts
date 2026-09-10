// FR-8 AC1: 관리자 예약 목록 조회 (설계문서 4-2 "GET /admin/reservations?status=&date_from=&date_to=").
// 체크인 날짜 기준으로 기간을 필터링하고, 예약이 접수된 시각(created_at) 기준 최신순으로 정렬한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ReservationStatus } from "@/lib/reservations/types";

const VALID_STATUSES: ReservationStatus[] = ["HOLD", "CONFIRMED", "CANCELLED", "EXPIRED"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
    // middleware.ts는 /admin 페이지만 보호하므로, /api/admin 라우트는 여기서 동일하게 Supabase Auth 세션을 직접 확인한다.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    if (status && !VALID_STATUSES.includes(status as ReservationStatus)) {
        return NextResponse.json({ error: "INVALID_STATUS", message: "status 값이 올바르지 않습니다." }, { status: 400 });
    }

    if ((dateFrom && !DATE_PATTERN.test(dateFrom)) || (dateTo && !DATE_PATTERN.test(dateTo))) {
        return NextResponse.json(
            { error: "INVALID_DATE", message: "date_from/date_to는 YYYY-MM-DD 형식이어야 합니다." },
            { status: 400 }
        );
    }

    try {
        let query = supabaseAdmin
            .from("reservations")
            .select(`
                id,
                guest_name,
                guest_phone,
                guest_count,
                check_in,
                check_out,
                status,
                total_price,
                refund_amount,
                created_at,
                room_types ( name ),
                rooms ( name ),
                properties ( name )
            `)
            .order("created_at", { ascending: false });

        if (status) query = query.eq("status", status);
        if (dateFrom) query = query.gte("check_in", dateFrom);
        if (dateTo) query = query.lte("check_in", dateTo);

        const { data, error } = await query;

        if (error) {
            console.error("[GET /api/admin/reservations]", error.message);
            return NextResponse.json(
                { error: "INTERNAL_ERROR", message: "예약 목록을 불러오지 못했습니다." },
                { status: 500 }
            );
        }

        return NextResponse.json({ reservations: data ?? [] });
    } catch (err) {
        console.error("[GET /api/admin/reservations]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
