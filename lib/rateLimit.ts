// 서버리스 인스턴스 단위 in-memory rate limiter (best-effort).
// Vercel 서버리스 함수는 인스턴스가 재사용되지 않거나 여러 리전/인스턴스로 분산될 수 있어
// 완벽한 전역 차단은 아니지만, 같은 인스턴스에 짧은 시간 반복 요청이 오는 무차별 대입 시도를 1차로 걸러내는 용도
// 여러 인스턴스에 걸친 엄격한 제한이 필요할 시, Upstash Redis 등 외부 스토어 기반 rate limiter로 교체

interface Bucket {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Bucket>();

// 매 호출마다 전체를 순회하면 IP가 많아질수록 비용이 커지므로, 낮은 확률로만 만료된 버킷을 정리한다.
const CLEANUP_PROBABILITY = 0.01;

function cleanupExpired(now: number) {
    if (Math.random() > CLEANUP_PROBABILITY) return;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

// key: 제한 대상을 구분하는 식별자 (보통 `${라우트}:${ip}`). limit: windowMs 동안 허용할 최대 요청 수.
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    cleanupExpired(now);

    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
        const resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (existing.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

// Vercel/대부분의 프록시는 클라이언트 IP를 x-forwarded-for 첫 번째 값으로 전달한다.
export function getClientIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return request.headers.get("x-real-ip") ?? "unknown";
}
