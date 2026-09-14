// Dashboard(ERP) 매출/환불 요약 - 예약관리 페이지는 예약 건별 상세만 다루고,
// 기간 합계/추이는 이 API로 한 곳에서만 계산한다(두 화면 역할 분리).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const TREND_MONTHS = 6;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function monthKey(year: number, month: number) {
    return `${year}-${String(month).padStart(2, "0")}`;
}

// 이 프로젝트는 국내 단일 숙소 운영을 전제로 하므로 "이번 달" 기준을 KST 달력으로 고정한다.
// timestamptz 컬럼(paid_at/cancelled_at)에 +09:00 오프셋을 명시해 구간을 넘기면 postgres가 알아서 변환한다.
function kstMonthStartISO(year: number, month: number) {
    const mm = String(month).padStart(2, "0");
    return `${year}-${mm}-01T00:00:00+09:00`;
}

function addMonths(year: number, month: number, delta: number) {
    const total = year * 12 + (month - 1) + delta;
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function currentKstMonth() {
    const kstNow = new Date(Date.now() + KST_OFFSET_MS);
    return { year: kstNow.getUTCFullYear(), month: kstNow.getUTCMonth() + 1 };
}

// timestamptz 값을 KST 기준 "YYYY-MM"로 버킷팅한다.
function toKstMonthKey(isoTimestamp: string) {
    const kst = new Date(new Date(isoTimestamp).getTime() + KST_OFFSET_MS);
    return monthKey(kst.getUTCFullYear(), kst.getUTCMonth() + 1);
}

function dateKey(year: number, month: number, day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function kstDateStartISO(year: number, month: number, day: number) {
    return `${dateKey(year, month, day)}T00:00:00+09:00`;
}

// KST 기준 "오늘"의 연/월/일과 요일(0=일 ~ 6=토)을 구한다. currentKstMonth()와 동일한 KST 보정 방식.
function currentKstDate() {
    const kstNow = new Date(Date.now() + KST_OFFSET_MS);
    return {
        year: kstNow.getUTCFullYear(),
        month: kstNow.getUTCMonth() + 1,
        day: kstNow.getUTCDate(),
        weekday: kstNow.getUTCDay(),
    };
}

function addDays(year: number, month: number, day: number, delta: number) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + delta);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export async function GET(request: Request) {
    // middleware.ts는 /admin 페이지만 보호하므로, /api/admin 라우트는 여기서 동일하게 Supabase Auth 세션을 직접 확인한다.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");

    if (monthParam && !MONTH_PATTERN.test(monthParam)) {
        return NextResponse.json(
            { error: "INVALID_MONTH", message: "month는 YYYY-MM 형식이어야 합니다." },
            { status: 400 }
        );
    }

    let targetYear: number;
    let targetMonth: number;
    if (monthParam) {
        const [y, m] = monthParam.split("-").map(Number);
        targetYear = y;
        targetMonth = m;
    } else {
        ({ year: targetYear, month: targetMonth } = currentKstMonth());
    }

    if (targetMonth < 1 || targetMonth > 12) {
        return NextResponse.json(
            { error: "INVALID_MONTH", message: "month는 YYYY-MM 형식이어야 합니다." },
            { status: 400 }
        );
    }

    // 추이는 선택한 달을 포함해 직전 5개월까지 총 TREND_MONTHS개 구간을 보여준다.
    const earliest = addMonths(targetYear, targetMonth, -(TREND_MONTHS - 1));
    const rangeStartISO = kstMonthStartISO(earliest.year, earliest.month);
    const rangeEndExclusive = addMonths(targetYear, targetMonth, 1);
    const rangeEndISO = kstMonthStartISO(rangeEndExclusive.year, rangeEndExclusive.month);

    try {
        // 매출 = 결제 완료(+환불 처리됐더라도 결제 자체는 있었던) 금액을 결제일 기준으로 집계.
        const { data: payments, error: paymentsError } = await supabaseAdmin
            .from("payments")
            .select("amount, paid_at")
            .in("status", ["PAID", "REFUNDED", "PARTIAL_REFUNDED"])
            .gte("paid_at", rangeStartISO)
            .lt("paid_at", rangeEndISO);

        if (paymentsError) throw new Error(paymentsError.message);

        // 환불액 = 취소일 기준으로 집계(결제월과 다를 수 있음 - 일반적인 매출/환불 분리 집계 방식).
        const { data: refunds, error: refundsError } = await supabaseAdmin
            .from("reservations")
            .select("refund_amount, cancelled_at")
            .not("refund_amount", "is", null)
            .not("cancelled_at", "is", null)
            .gte("cancelled_at", rangeStartISO)
            .lt("cancelled_at", rangeEndISO);

        if (refundsError) throw new Error(refundsError.message);

        // FR-10: 오늘/이번주 예약 수 - 예약이 "접수된" 시점(created_at) 기준으로 세서,
        // 체크인 예정 건수가 아니라 실제 유입된 신규 예약 활동량을 보여준다(홀드/확정/취소 등 상태 무관 전체 건수).
        const today = currentKstDate();
        const tomorrow = addDays(today.year, today.month, today.day, 1);
        const todayFrom = dateKey(today.year, today.month, today.day);
        const todayStartISO = kstDateStartISO(today.year, today.month, today.day);
        const todayEndISO = kstDateStartISO(tomorrow.year, tomorrow.month, tomorrow.day);

        // 이번주 = 월요일 시작 기준 (weekday: 0=일 ~ 6=토 -> 월요일로부터 지난 일수)
        const daysSinceMonday = (today.weekday + 6) % 7;
        const weekStart = addDays(today.year, today.month, today.day, -daysSinceMonday);
        const weekEndExclusive = addDays(weekStart.year, weekStart.month, weekStart.day, 7);
        const weekEndInclusive = addDays(weekStart.year, weekStart.month, weekStart.day, 6);
        const weekFrom = dateKey(weekStart.year, weekStart.month, weekStart.day);
        const weekTo = dateKey(weekEndInclusive.year, weekEndInclusive.month, weekEndInclusive.day);
        const weekStartISO = kstDateStartISO(weekStart.year, weekStart.month, weekStart.day);
        const weekEndISO = kstDateStartISO(weekEndExclusive.year, weekEndExclusive.month, weekEndExclusive.day);

        const { count: todayCount, error: todayError } = await supabaseAdmin
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .gte("created_at", todayStartISO)
            .lt("created_at", todayEndISO);

        if (todayError) throw new Error(todayError.message);

        const { count: weekCount, error: weekError } = await supabaseAdmin
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .gte("created_at", weekStartISO)
            .lt("created_at", weekEndISO);

        if (weekError) throw new Error(weekError.message);

        const revenueByMonth = new Map<string, number>();
        for (const p of payments ?? []) {
            if (!p.paid_at) continue;
            const key = toKstMonthKey(p.paid_at);
            revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + p.amount);
        }

        const refundByMonth = new Map<string, number>();
        for (const r of refunds ?? []) {
            if (!r.cancelled_at || r.refund_amount === null) continue;
            const key = toKstMonthKey(r.cancelled_at);
            refundByMonth.set(key, (refundByMonth.get(key) ?? 0) + r.refund_amount);
        }

        const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
            const { year, month } = addMonths(earliest.year, earliest.month, i);
            const key = monthKey(year, month);
            const revenue = revenueByMonth.get(key) ?? 0;
            const refund = refundByMonth.get(key) ?? 0;
            return { month: key, revenue, refund, net: revenue - refund };
        });

        const current = trend[trend.length - 1];

        return NextResponse.json({
            month: current.month,
            revenue: current.revenue,
            refund: current.refund,
            net: current.net,
            trend,
            today: { count: todayCount ?? 0, date_from: todayFrom, date_to: todayFrom },
            thisWeek: { count: weekCount ?? 0, date_from: weekFrom, date_to: weekTo },
        });
    } catch (err) {
        console.error("[GET /api/admin/dashboard/summary]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "대시보드 요약을 불러오지 못했습니다." },
            { status: 500 }
        );
    }
}
