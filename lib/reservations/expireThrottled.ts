import { expireDueHolds } from "./expire";

// [실험용 프로토타입] 옵션 1(짧은 TTL 인메모리 디바운스) 검증을 위한 래퍼.
// expire.ts는 건드리지 않고, 관리자 라우트 4곳이 짧은 시간 안에 겹쳐 호출할 때
// 첫 호출만 실제로 expireDueHolds()를 실행하고 나머지는 스킵되는지 확인하는 용도.
const THROTTLE_MS = 5000;
let lastRunAt = 0;
let actualCallCount = 0; // 실제로 expireDueHolds()까지 도달한 횟수(테스트 검증용)

export async function expireDueHoldsThrottled(now: Date = new Date()) {
    if (Date.now() - lastRunAt < THROTTLE_MS) {
        return [];
    }
    lastRunAt = Date.now();
    actualCallCount++;
    return expireDueHolds(now);
}

export function getActualCallCount() {
    return actualCallCount;
}

export function __resetThrottleForTest() {
    lastRunAt = 0;
    actualCallCount = 0;
}
