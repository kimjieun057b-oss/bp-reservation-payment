import type { SupabaseClient } from "@supabase/supabase-js";

// FR-1 / DEC-004: 성수기(특정기간) 규칙이 주말(요일) 규칙보다 priority가 높을 때 우선 적용된다.
export interface PriceRule {
    start_date: string | null;
    end_date: string | null;
    days_of_week: number[] | null;
    price: number;
    priority: number;
}

export function toISODate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// [check_in, check_out) 사이의 숙박일(밤) 목록을 반환한다.
export function enumerateNights(checkIn: string, checkOut: string): Date[] {
    const nights: Date[] = [];
    let cursor = new Date(`${checkIn}T00:00:00Z`);
    const end = new Date(`${checkOut}T00:00:00Z`);

    while (cursor < end) {
        nights.push(cursor);
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return nights;
}

// 해당 날짜에 매칭되는 price_rules 중 priority가 가장 높은 것을 적용하고, 없으면 base_price를 사용한다.
export function resolveNightlyPrice(date: Date, basePrice: number, rules: PriceRule[]): number {
    const iso = toISODate(date);
    const dayOfWeek = date.getUTCDay();

    const matched = rules.filter((rule) => {
        if (rule.start_date && rule.end_date) {
            return iso >= rule.start_date && iso <= rule.end_date;
        }
        if (rule.days_of_week) {
            return rule.days_of_week.includes(dayOfWeek);
        }
        return false;
    });

    if (matched.length === 0) return basePrice;

    return matched.reduce((best, rule) => (rule.priority > best.priority ? rule : best)).price;
}

// 캘린더 UI에서 "성수기/주말" 뱃지를 표시하기 위한 분류. 가격 우선순위(priority)와는 무관하게
// "이 날짜에 매칭되는 규칙 종류"만 본다 (기간 규칙이면 성수기, 요일 규칙이면 주말 — 둘 다 매칭될 수도 있다).
export function classifyDate(date: Date, rules: PriceRule[]): { isPeak: boolean; isWeekend: boolean } {
    const iso = toISODate(date);
    const dayOfWeek = date.getUTCDay();

    const isPeak = rules.some(
        (rule) => rule.start_date && rule.end_date && iso >= rule.start_date && iso <= rule.end_date
    );
    const isWeekend = rules.some((rule) => rule.days_of_week && rule.days_of_week.includes(dayOfWeek));

    return { isPeak, isWeekend };
}

export async function calculateTotalPrice(
    supabase: SupabaseClient,
    roomTypeId: string,
    checkIn: string,
    checkOut: string
): Promise<number> {
    const { data: roomType, error: roomTypeError } = await supabase
        .from("room_types")
        .select("base_price")
        .eq("id", roomTypeId)
        .single();

    if (roomTypeError || !roomType) {
        throw new Error("ROOM_TYPE_NOT_FOUND");
    }

    const { data: rules, error: rulesError } = await supabase
        .from("price_rules")
        .select("start_date, end_date, days_of_week, price, priority")
        .eq("room_type_id", roomTypeId);

    if (rulesError) {
        throw new Error(rulesError.message);
    }

    const nights = enumerateNights(checkIn, checkOut);

    return nights.reduce(
        (sum, night) => sum + resolveNightlyPrice(night, roomType.base_price, rules ?? []),
        0
    );
}

// FR: 예약 시 옵션 상품(addons) 선택 시 추가금액 계산 (docs/superpowers/specs/2026-09-18-addon-products-design.md)
export interface AddonSelection {
    addon_id: string;
    quantity: number;
}

export interface AddonRow {
    id: string;
    property_id: string;
    name: string;
    price: number;
    is_active: boolean;
}

export interface AddonLineItem {
    addon_id: string;
    name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
}

export type ResolveAddonsError = "ADDON_NOT_FOUND";

export type ResolveAddonsResult =
    | { ok: true; total: number; items: AddonLineItem[] }
    | { ok: false; error: ResolveAddonsError };

// quantity<=0인 항목은 무시한다. 존재하지 않거나 비활성화됐거나 다른 property 소속인 addon을
// 선택하면 전체를 실패 처리한다(부분 성공 없음). DB 조회 없이 순수 계산만 하므로 단위 테스트가 쉽다.
export function computeAddonSelections(
    selections: AddonSelection[],
    addons: AddonRow[],
    propertyId: string
): ResolveAddonsResult {
    const items: AddonLineItem[] = [];
    let total = 0;

    for (const selection of selections) {
        if (selection.quantity <= 0) continue;

        const addon = addons.find((a) => a.id === selection.addon_id);
        if (!addon || !addon.is_active || addon.property_id !== propertyId) {
            return { ok: false, error: "ADDON_NOT_FOUND" };
        }

        const lineTotal = addon.price * selection.quantity;
        items.push({
            addon_id: addon.id,
            name: addon.name,
            unit_price: addon.price,
            quantity: selection.quantity,
            line_total: lineTotal,
        });
        total += lineTotal;
    }

    return { ok: true, total, items };
}

export async function resolveAddonSelections(
    supabase: SupabaseClient,
    propertyId: string,
    selections: AddonSelection[]
): Promise<ResolveAddonsResult> {
    const addonIds = selections.filter((s) => s.quantity > 0).map((s) => s.addon_id);
    if (addonIds.length === 0) {
        return { ok: true, total: 0, items: [] };
    }

    const { data, error } = await supabase
        .from("addons")
        .select("id, property_id, name, price, is_active")
        .in("id", addonIds);

    if (error) {
        throw new Error(error.message);
    }

    return computeAddonSelections(selections, (data ?? []) as AddonRow[], propertyId);
}
