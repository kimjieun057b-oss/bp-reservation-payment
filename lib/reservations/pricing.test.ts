import { describe, expect, it } from "vitest";
import { enumerateNights, resolveNightlyPrice, type PriceRule } from "./pricing";

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
