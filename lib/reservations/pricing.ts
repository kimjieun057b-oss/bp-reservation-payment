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
