# lib/reservations

예약 홀드 생성 → 만료 → 결제 확정 → 취소/환불로 이어지는 도메인 로직을 여기에 구현한다 (PRD FR-2~4, FR-6, FR-7).

- `lib/payments`, `lib/notifications`의 구현체에 직접 의존하지 않고 인터페이스로만 접근한다.
- 동일 객실·기간에 대한 동시 예약은 DB 레벨 제약(`EXCLUDE`)으로 차단하는 것을 전제로 설계한다 (PRD NFR).

## 파일 구성

| 파일 | 역할 |
|---|---|
| `pricing.ts` | `price_rules` 기반 요금 계산 (성수기 특정기간이 요일 규칙보다 priority로 우선) |
| `hold.ts` | `createHold` — 유닛(rooms)을 순회하며 INSERT, `EXCLUDE` 제약 위반(23P01)이면 다음 유닛으로 자동 폴백 |
| `confirm.ts` | `confirmReservation` — 결제 웹훅에서 호출되는 HOLD→CONFIRMED 전환 (멱등) |
| `expire.ts` | `expireDueHolds` — 만료된 HOLD 일괄 정리 (Cron이 M6에서 이 함수를 호출) |
| `cancel.ts` | `releaseHold`(결제 전 홀드 해제) / `cancelReservation`(결제 후 취소 + `refund_policies` 기반 환불액 계산) |
| `refund.ts` | 환불 규정 매칭 순수 함수 (DB 의존 없음, 단위 테스트 대상) |

## 테스트

- `pricing.test.ts`, `refund.test.ts`: 순수 함수 단위 테스트. `npm run test`로 항상 실행됨.
- `hold.concurrency.test.ts`: 동일 재고(1개)에 동시에 두 개의 홀드 요청을 보내 **1건만 성공하고 나머지는 `ROOM_UNAVAILABLE`**이 되는지 검증하는 통합 테스트 (NFR "동시성" 항목). 실제 Supabase 프로젝트에 마이그레이션이 적용되어 있어야 하며, `SUPABASE_SERVICE_ROLE_KEY` 등 환경변수가 없으면 자동으로 skip된다.
