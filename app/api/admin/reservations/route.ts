// FR-8 AC1: 관리자 예약 목록 조회 (설계문서 4-2 "GET /admin/reservations?status=&date_from=&date_to=").
// 체크인 날짜 기준으로 기간을 필터링하고, 예약이 접수된 시각(created_at) 기준 최신순으로 정렬한다.
// created_from/created_to: 대시보드의 "오늘/이번주 예약 수" 드릴다운 전용 - 체크인일이 아니라
// 예약이 "접수된" 날짜(created_at, KST) 기준으로 필터링한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ReservationStatus } from "@/lib/reservations/types";
import { expireDueHolds } from "@/lib/reservations/expire";

const VALID_STATUSES: ReservationStatus[] = ["HOLD", "CONFIRMED", "CANCELLED", "EXPIRED"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// PostgREST의 .or() 필터 문법은 쉼표/괄호를 절 구분자로 쓰므로, 키워드에 포함돼 있으면
// 걷어내서 검색어가 필터 구문으로 해석되는 걸 막는다.
function sanitizeKeyword(value: string) {
    return value.replace(/[,()]/g, "");
}

// dashboard/summary route.ts의 kstDateStartISO와 동일한 KST 보정 방식.
function kstDateStartISO(dateStr: string) {
    return `${dateStr}T00:00:00+09:00`;
}

function addDaysToDateStr(dateStr: string, delta: number) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + delta);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
    // proxy.ts(구 middleware.ts)가 /api/admin도 보호하지만, 라우트 단위 방어를 위해 여기서도 동일하게 확인한다.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const createdFrom = searchParams.get("created_from");
    const createdTo = searchParams.get("created_to");
    const keyword = searchParams.get("keyword")?.trim() ?? "";

    const pageParam = Number(searchParams.get("page") ?? "1");
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

    const pageSizeParam = Number(searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE));
    const pageSize =
        Number.isInteger(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= MAX_PAGE_SIZE
            ? pageSizeParam
            : DEFAULT_PAGE_SIZE;

    if (status && !VALID_STATUSES.includes(status as ReservationStatus)) {
        return NextResponse.json({ error: "INVALID_STATUS", message: "status 값이 올바르지 않습니다." }, { status: 400 });
    }

    if ((dateFrom && !DATE_PATTERN.test(dateFrom)) || (dateTo && !DATE_PATTERN.test(dateTo))) {
        return NextResponse.json(
            { error: "INVALID_DATE", message: "date_from/date_to는 YYYY-MM-DD 형식이어야 합니다." },
            { status: 400 }
        );
    }

    if ((createdFrom && !DATE_PATTERN.test(createdFrom)) || (createdTo && !DATE_PATTERN.test(createdTo))) {
        return NextResponse.json(
            { error: "INVALID_DATE", message: "created_from/created_to는 YYYY-MM-DD 형식이어야 합니다." },
            { status: 400 }
        );
    }

    try {
        // FR-12 보정: 외부 스케줄러가 아직 못 돈 구간이 있어도, 관리자가 목록을 볼 때는
        // 만료된 홀드를 먼저 정리해서 '결제대기'가 실제보다 오래 남아있지 않도록 한다.
        try {
            await expireDueHolds();
        } catch (err) {
            console.error("[GET /api/admin/reservations] expireDueHolds failed", err);
        }

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
                cancel_reason,
                created_at,
                room_types ( name ),
                rooms ( name ),
                properties ( name ),
                reservation_addons ( quantity, price, addons ( name ) )
            `, { count: "exact" })
            .order("created_at", { ascending: false });

        if (status) query = query.eq("status", status);
        if (dateFrom) query = query.gte("check_in", dateFrom);
        if (dateTo) query = query.lte("check_in", dateTo);
        if (createdFrom) query = query.gte("created_at", kstDateStartISO(createdFrom));
        if (createdTo) query = query.lt("created_at", kstDateStartISO(addDaysToDateStr(createdTo, 1)));
        if (keyword) {
            const safeKeyword = sanitizeKeyword(keyword);
            query = query.or(`guest_name.ilike.%${safeKeyword}%,guest_phone.ilike.%${safeKeyword}%`);
        }

        // 목록 전체를 매번 가져오는 대신 서버에서 페이지 단위로만 잘라 응답 크기와 쿼리 비용을 줄인다.
        const offset = (page - 1) * pageSize;
        query = query.range(offset, offset + pageSize - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error("[GET /api/admin/reservations]", error.message);
            return NextResponse.json(
                { error: "INTERNAL_ERROR", message: "예약 목록을 불러오지 못했습니다." },
                { status: 500 }
            );
        }

        return NextResponse.json({ reservations: data ?? [], total: count ?? 0, page, page_size: pageSize });
    } catch (err) {
        console.error("[GET /api/admin/reservations]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
