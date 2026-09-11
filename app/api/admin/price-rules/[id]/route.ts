// FR-9 AC1: 요금 정책 수정/삭제.
// PATCH는 부분 수정이지만, start_date/end_date/days_of_week 중 하나라도 바뀌면 기존 값과 병합한 뒤
// "기간 또는 요일 중 정확히 하나"라는 불변조건을 다시 검증한다 (POST와 동일한 이유 — pricing.ts가 둘 다
// 있으면 기간을 우선 판정해 요일 쪽을 무시하므로, 어중간한 상태로 저장되지 않게 막는다).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Params = { params: Promise<{ id: string }> };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDaysOfWeek(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    );
}

export async function PATCH(request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("price_rules")
        .select("name, start_date, end_date, days_of_week, price, priority")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
        return NextResponse.json({ error: "NOT_FOUND", message: "요금 정책을 찾을 수 없습니다." }, { status: 404 });
    }

    const touchesRuleType = ["start_date", "end_date", "days_of_week"].some((f) => body?.[f] !== undefined);

    const updates: Record<string, unknown> = {};
    if (body?.name !== undefined) updates.name = typeof body.name === "string" ? body.name.trim() : "";
    if (body?.price !== undefined) updates.price = Number(body.price);
    if (body?.priority !== undefined) updates.priority = Number(body.priority);

    if ("name" in updates && !updates.name) {
        return NextResponse.json({ error: "INVALID_NAME", message: "요금 정책 이름을 입력해 주세요." }, { status: 400 });
    }
    if ("price" in updates && (!Number.isFinite(updates.price) || (updates.price as number) < 0)) {
        return NextResponse.json({ error: "INVALID_PRICE", message: "가격을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if ("priority" in updates && !Number.isInteger(updates.priority)) {
        return NextResponse.json({ error: "INVALID_PRIORITY", message: "우선순위는 정수여야 합니다." }, { status: 400 });
    }

    if (touchesRuleType) {
        // 병합된 최종 상태로 기간/요일 불변조건을 재검증한다.
        const mergedStartDate = body?.start_date !== undefined ? body.start_date : existing.start_date;
        const mergedEndDate = body?.end_date !== undefined ? body.end_date : existing.end_date;
        const mergedDaysOfWeek = body?.days_of_week !== undefined ? body.days_of_week : existing.days_of_week;

        const hasPeriod = !!mergedStartDate || !!mergedEndDate;
        const hasDaysOfWeek = !!mergedDaysOfWeek;

        if (hasPeriod === hasDaysOfWeek) {
            return NextResponse.json(
                { error: "INVALID_RULE_TYPE", message: "특정 기간(시작일/종료일) 또는 요일 중 하나만 지정해 주세요." },
                { status: 400 }
            );
        }

        if (hasPeriod) {
            if (!DATE_PATTERN.test(String(mergedStartDate)) || !DATE_PATTERN.test(String(mergedEndDate))) {
                return NextResponse.json({ error: "INVALID_DATE", message: "시작일/종료일이 올바르지 않습니다." }, { status: 400 });
            }
            if ((mergedEndDate as string) < (mergedStartDate as string)) {
                return NextResponse.json({ error: "INVALID_DATE_RANGE", message: "종료일은 시작일 이후여야 합니다." }, { status: 400 });
            }
            updates.start_date = mergedStartDate;
            updates.end_date = mergedEndDate;
            updates.days_of_week = null;
        } else {
            if (!isValidDaysOfWeek(mergedDaysOfWeek)) {
                return NextResponse.json(
                    { error: "INVALID_DAYS_OF_WEEK", message: "요일은 0(일)~6(토) 사이 값으로 하나 이상 선택해 주세요." },
                    { status: 400 }
                );
            }
            updates.days_of_week = mergedDaysOfWeek;
            updates.start_date = null;
            updates.end_date = null;
        }
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "NO_FIELDS", message: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("price_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("[PATCH /api/admin/price-rules/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "요금 정책 수정에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ price_rule: data });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    // price_rules는 reservations에서 직접 참조하지 않고 total_price 계산 시점에만 쓰이므로(비정규화 저장),
    // room_types/rooms와 달리 예약 이력과 무관하게 자유롭게 삭제할 수 있다.
    const { error } = await supabaseAdmin.from("price_rules").delete().eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/price-rules/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "요금 정책 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
