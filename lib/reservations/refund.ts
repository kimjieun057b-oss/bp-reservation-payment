// FR-4/FR-7, DEC-002: 환불 규정 매칭 로직 (DB 접근 없는 순수 함수라 단위 테스트로 검증한다)

export interface RefundPolicyTier {
    days_before: number;
    refund_percent: number;
}

// 체크인까지 남은 일수 이하의 days_before 중 가장 큰 값을 찾아 그 환불율을 적용한다.
// 예: 정책이 (7,100)/(5,70)/(3,50)/(1,30)/(0,0)일 때 남은 일수 4 -> days_before=3 매칭 -> 50%
export function resolveRefundPercent(daysUntilCheckIn: number, policies: RefundPolicyTier[]): number {
    const eligible = policies
        .filter((policy) => policy.days_before <= daysUntilCheckIn)
        .sort((a, b) => b.days_before - a.days_before);

    return eligible[0]?.refund_percent ?? 0;
}

export function daysUntil(checkIn: string, from: Date = new Date()): number {
    const checkInDate = new Date(`${checkIn}T00:00:00`);
    const fromDateOnly = new Date(`${toISODate(from)}T00:00:00`);
    const diffMs = checkInDate.getTime() - fromDateOnly.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function toISODate(date: Date): string {
    return date.toISOString().slice(0, 10);
}
