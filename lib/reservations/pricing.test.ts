import { describe, expect, it } from "vitest";
import { enumerateNights, resolveNightlyPrice, computeAddonSelections, type PriceRule, type AddonRow } from "./pricing";

describe("enumerateNights", () => {
    it("체크인~체크아웃 사이의 밤 목록을 반환한다 ([체크인, 체크아웃) 반열린구간)", () => {
        const nights = enumerateNights("2027-07-20", "2027-07-23");
        expect(nights.map((d) => d.toISOString().slice(0, 10))).toEqual([
            "2027-07-20",
            "2027-07-21",
            "2027-07-22",
        ]);
    });
});

describe("resolveNightlyPrice (DEC-004: 성수기 priority가 주말 priority보다 우선)", () => {
    const basePrice = 100000;
    const weekend: PriceRule = {
        start_date: null,
        end_date: null,
        days_of_week: [5, 6],
        price: 130000,
        priority: 1,
    };
    const summerPeak: PriceRule = {
        start_date: "2027-07-15",
        end_date: "2027-08-24",
        days_of_week: null,
        price: 180000,
        priority: 10,
    };
    const rules = [weekend, summerPeak];

    it("규칙이 없는 평일은 base_price를 사용한다", () => {
        // 2027-07-05는 월요일이고 성수기 기간 밖
        const date = new Date("2027-07-05T00:00:00Z");
        expect(resolveNightlyPrice(date, basePrice, rules)).toBe(basePrice);
    });

    it("성수기 밖의 주말은 주말 요금을 사용한다", () => {
        // 2027-07-02는 금요일, 성수기 기간(07-15~08-24) 밖
        const date = new Date("2027-07-02T00:00:00Z");
        expect(resolveNightlyPrice(date, basePrice, rules)).toBe(weekend.price);
    });

    it("성수기 기간의 평일은 성수기 요금을 사용한다", () => {
        // 2027-07-20은 화요일, 성수기 기간 안
        const date = new Date("2027-07-20T00:00:00Z");
        expect(resolveNightlyPrice(date, basePrice, rules)).toBe(summerPeak.price);
    });

    it("성수기 기간의 주말은 두 규칙이 모두 매칭되지만 priority가 높은 성수기 요금이 우선한다", () => {
        // 2027-07-23은 금요일이면서 성수기 기간 안 -> weekend, summerPeak 둘 다 매칭
        const date = new Date("2027-07-23T00:00:00Z");
        expect(resolveNightlyPrice(date, basePrice, rules)).toBe(summerPeak.price);
    });
});

describe("computeAddonSelections", () => {
    const propertyId = "00000000-0000-0000-0000-000000000001";
    const addons: AddonRow[] = [
        { id: "addon-1", property_id: propertyId, name: "온수풀 이용권", price: 30000, is_active: true },
        { id: "addon-2", property_id: propertyId, name: "바베큐 세트", price: 25000, is_active: true },
        { id: "addon-3", property_id: propertyId, name: "비활성 옵션", price: 10000, is_active: false },
    ];

    it("수량>0인 옵션들의 합계와 라인 항목을 반환한다", () => {
        const result = computeAddonSelections(
            [
                { addon_id: "addon-1", quantity: 2 },
                { addon_id: "addon-2", quantity: 1 },
            ],
            addons,
            propertyId
        );

        expect(result).toEqual({
            ok: true,
            total: 30000 * 2 + 25000,
            items: [
                { addon_id: "addon-1", name: "온수풀 이용권", unit_price: 30000, quantity: 2, line_total: 60000 },
                { addon_id: "addon-2", name: "바베큐 세트", unit_price: 25000, quantity: 1, line_total: 25000 },
            ],
        });
    });

    it("수량이 0 이하인 항목은 무시한다", () => {
        const result = computeAddonSelections([{ addon_id: "addon-1", quantity: 0 }], addons, propertyId);
        expect(result).toEqual({ ok: true, total: 0, items: [] });
    });

    it("비활성 addon을 선택하면 ADDON_NOT_FOUND를 반환한다", () => {
        const result = computeAddonSelections([{ addon_id: "addon-3", quantity: 1 }], addons, propertyId);
        expect(result).toEqual({ ok: false, error: "ADDON_NOT_FOUND" });
    });

    it("존재하지 않는 addon_id면 ADDON_NOT_FOUND를 반환한다", () => {
        const result = computeAddonSelections([{ addon_id: "addon-404", quantity: 1 }], addons, propertyId);
        expect(result).toEqual({ ok: false, error: "ADDON_NOT_FOUND" });
    });

    it("다른 property 소속 addon이면 ADDON_NOT_FOUND를 반환한다", () => {
        const otherPropertyAddon: AddonRow = {
            id: "addon-9",
            property_id: "other-property",
            name: "다른 숙소 옵션",
            price: 5000,
            is_active: true,
        };
        const result = computeAddonSelections(
            [{ addon_id: "addon-9", quantity: 1 }],
            [...addons, otherPropertyAddon],
            propertyId
        );
        expect(result).toEqual({ ok: false, error: "ADDON_NOT_FOUND" });
    });
});
