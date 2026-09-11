// FR-9 AC1: 요금 정책(price_rules, 기간형/요일형) CRUD (설계문서 4-2 "POST /admin/price-rules").
// 한 규칙은 "특정 기간"(start_date+end_date) 또는 "요일"(days_of_week) 둘 중 하나로만 성립한다.
// pricing.ts의 resolveNightlyPrice가 start_date+end_date를 우선 판정하고 있어(요일은 무시됨),
// 둘을 동시에 넣으면 의미가 모호해지므로 생성 시점에 정확히 하나만 허용한다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDaysOfWeek(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    );
}

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomTypeId = searchParams.get("room_type_id");

    let query = supabaseAdmin
        .from("price_rules")
        .select("id, room_type_id, name, start_date, end_date, days_of_week, price, priority, created_at, room_types ( name )")
        .order("priority", { ascending: false });

    if (roomTypeId) query = query.eq("room_type_id", roomTypeId);

    const { data, error } = await query;

    if (error) {
        console.error("[GET /api/admin/price-rules]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "요금 정책 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ price_rules: data ?? [] });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const roomTypeId = typeof body?.room_type_id === "string" ? body.room_type_id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const price = Number(body?.price);
    const priority = body?.priority !== undefined ? Number(body.priority) : 0;

    // 프론트엔드 폼은 두 모드를 다 보내되 안 쓰는 쪽을 null로 채워서 보내므로(선택 폼 구조상),
    // 값의 존재(!== undefined)가 아니라 실제 값이 있는지(truthy)로 모드를 판정해야 한다.
    const hasPeriod = !!body?.start_date || !!body?.end_date;
    const hasDaysOfWeek = Array.isArray(body?.days_of_week) && body.days_of_week.length > 0;

    if (!roomTypeId) {
        return NextResponse.json({ error: "INVALID_ROOM_TYPE", message: "객실 타입을 선택해 주세요." }, { status: 400 });
    }
    if (!name) {
        return NextResponse.json({ error: "INVALID_NAME", message: "요금 정책 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "INVALID_PRICE", message: "가격을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isInteger(priority)) {
        return NextResponse.json({ error: "INVALID_PRIORITY", message: "우선순위는 정수여야 합니다." }, { status: 400 });
    }
    if (hasPeriod === hasDaysOfWeek) {
        return NextResponse.json(
            { error: "INVALID_RULE_TYPE", message: "특정 기간(시작일/종료일) 또는 요일 중 하나만 지정해 주세요." },
            { status: 400 }
        );
    }

    let startDate: string | null = null;
    let endDate: string | null = null;
    let daysOfWeek: number[] | null = null;

    if (hasPeriod) {
        const rawStartDate: string = typeof body?.start_date === "string" ? body.start_date : "";
        const rawEndDate: string = typeof body?.end_date === "string" ? body.end_date : "";
        if (!DATE_PATTERN.test(rawStartDate) || !DATE_PATTERN.test(rawEndDate)) {
            return NextResponse.json({ error: "INVALID_DATE", message: "시작일/종료일이 올바르지 않습니다." }, { status: 400 });
        }
        if (rawEndDate < rawStartDate) {
            return NextResponse.json({ error: "INVALID_DATE_RANGE", message: "종료일은 시작일 이후여야 합니다." }, { status: 400 });
        }
        startDate = rawStartDate;
        endDate = rawEndDate;
    } else {
        if (!isValidDaysOfWeek(body?.days_of_week)) {
            return NextResponse.json(
                { error: "INVALID_DAYS_OF_WEEK", message: "요일은 0(일)~6(토) 사이 값으로 하나 이상 선택해 주세요." },
                { status: 400 }
            );
        }
        daysOfWeek = body.days_of_week;
    }

    const { data, error } = await supabaseAdmin
        .from("price_rules")
        .insert({
            room_type_id: roomTypeId,
            name,
            start_date: startDate,
            end_date: endDate,
            days_of_week: daysOfWeek,
            price,
            priority,
        })
        .select()
        .single();

    if (error) {
        console.error("[POST /api/admin/price-rules]", error.message);
        const status = error.code === "23503" ? 400 : 500;
        const message = status === 400 ? "존재하지 않는 객실 타입입니다." : "요금 정책 생성에 실패했습니다.";
        return NextResponse.json({ error: "INTERNAL_ERROR", message }, { status });
    }

    return NextResponse.json({ price_rule: data }, { status: 201 });
}
