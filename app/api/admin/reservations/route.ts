// FR-8 AC1: 관리자 예약 목록 조회 (설계문서 4-2 "GET /admin/reservations?status=&date_from=&date_to=").
// 체크인 날짜 기준으로 기간을 필터링하고, 예약이 접수된 시각(created_at) 기준 최신순으로 정렬한다.
// created_from/created_to: 대시보드의 "오늘/이번주 예약 수" 드릴다운 전용 - 체크인일이 아니라
// 예약이 "접수된" 날짜(created_at, KST) 기준으로 필터링한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ReservationStatus } from "@/lib/reservations/types";
import { expireDueHolds } from "@/lib/reservations/expire";
import { createHold, type CreateHoldError } from "@/lib/reservations/hold";
import { confirmPhoneBooking } from "@/lib/reservations/phoneBooking";
import { attachAddonOptions, type AddonSelection } from "@/lib/reservations/options";

const VALID_STATUSES: ReservationStatus[] = ["HOLD", "CONFIRMED", "CANCELLED", "EXPIRED"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// 고객용 POST /api/reservations/hold/route.ts와 동일한 매핑 - 관리자 전화 예약 생성도
// createHold()의 같은 에러를 그대로 받으므로 메시지만 이 파일에도 둔다.
const HOLD_ERROR_STATUS: Record<CreateHoldError, number> = {
    INVALID_DATES: 400,
    ROOM_TYPE_NOT_FOUND: 404,
    ROOM_UNAVAILABLE: 409,
};

const HOLD_ERROR_MESSAGE: Record<CreateHoldError, string> = {
    INVALID_DATES: "체크아웃 날짜는 체크인 날짜보다 이후여야 합니다.",
    ROOM_TYPE_NOT_FOUND: "존재하지 않거나 비활성화된 객실 타입입니다.",
    ROOM_UNAVAILABLE: "선택하신 날짜는 이미 예약이 진행 중입니다.",
};

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
                source,
                total_price,
                refund_amount,
                cancel_reason,
                created_at,
                room_types ( name ),
                rooms ( name ),
                properties ( name )
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

// 전화로 받은 예약을 관리자가 직접 등록한다. createHold()를 고객용 경로와 그대로 공유하되
// source="PHONE"으로 남기고, confirm_now가 true면(계좌이체를 이미 확인한 경우) 결제 절차 없이
// 바로 확정 처리한다(confirmPhoneBooking).
export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문을 확인해주세요." }, { status: 400 });
    }

    const { room_type_id, check_in, check_out, guest_name, guest_phone, guest_email, guest_count, memo, confirm_now } =
        body as Record<string, string | number | boolean | undefined>;
    const addonOptionsInput = Array.isArray(body?.addon_options)
        ? (body.addon_options as unknown[]).filter(
              (o): o is AddonSelection =>
                  typeof o === "object" && o !== null && typeof (o as AddonSelection).addon_option_id === "string"
          ).map((o) => ({ addon_option_id: o.addon_option_id, quantity: Number(o.quantity) || 1 }))
        : [];

    if (!room_type_id || !check_in || !check_out || !guest_name || !guest_phone) {
        return NextResponse.json({ error: "MISSING_FIELDS", message: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    try {
        const result = await createHold({
            room_type_id: String(room_type_id),
            check_in: String(check_in),
            check_out: String(check_out),
            guest_name: String(guest_name),
            guest_phone: String(guest_phone),
            guest_email: guest_email ? String(guest_email) : undefined,
            guest_count: guest_count ? Number(guest_count) : undefined,
            memo: memo ? String(memo) : undefined,
            source: "PHONE",
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error, message: HOLD_ERROR_MESSAGE[result.error] },
                { status: HOLD_ERROR_STATUS[result.error] }
            );
        }

        const optionsTotal = await attachAddonOptions(result.reservation.id, addonOptionsInput);

        let status: "HOLD" | "CONFIRMED" = "HOLD";
        if (confirm_now === true) {
            await confirmPhoneBooking(result.reservation.id);
            status = "CONFIRMED";
        }

        return NextResponse.json(
            {
                reservation_id: result.reservation.id,
                status,
                total_price: result.reservation.total_price + optionsTotal,
                hold_expire_at: status === "CONFIRMED" ? null : result.reservation.hold_expire_at,
            },
            { status: 201 }
        );
    } catch (err) {
        console.error("[POST /api/admin/reservations]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
