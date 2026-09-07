import { describe, expect, it } from "vitest";
import { daysUntil, resolveRefundPercent, type RefundPolicyTier } from "./refund";

// DEC-002: D-7 이상 100% / D-5 70% / D-3 50% / D-1 30% / 당일(D-0) 0%
const policies: RefundPolicyTier[] = [
    { days_before: 7, refund_percent: 100 },
    { days_before: 5, refund_percent: 70 },
    { days_before: 3, refund_percent: 50 },
    { days_before: 1, refund_percent: 30 },
    { days_before: 0, refund_percent: 0 },
];

describe("resolveRefundPercent", () => {
    it("남은 일수 이하의 days_before 중 가장 큰 값을 적용한다", () => {
        expect(resolveRefundPercent(10, policies)).toBe(100);
        expect(resolveRefundPercent(7, policies)).toBe(100);
        expect(resolveRefundPercent(6, policies)).toBe(70);
        expect(resolveRefundPercent(4, policies)).toBe(50); // D-4 -> D-3 규정(50%) 적용
        expect(resolveRefundPercent(2, policies)).toBe(30);
        expect(resolveRefundPercent(0, policies)).toBe(0);
    });

    it("매칭되는 규정이 하나도 없으면(음수 등) 0%를 반환한다", () => {
        expect(resolveRefundPercent(-1, [{ days_before: 0, refund_percent: 0 }].slice(1))).toBe(0);
    });
});

describe("daysUntil", () => {
    it("체크인까지 남은 일수를 계산한다 (시/분/초 무시, 날짜 단위)", () => {
        const from = new Date("2027-07-10T23:59:00Z");
        expect(daysUntil("2027-07-13", from)).toBe(3);
        expect(daysUntil("2027-07-10", from)).toBe(0);
        expect(daysUntil("2027-07-09", from)).toBe(-1);
    });
});
