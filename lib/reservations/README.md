# lib/reservations

예약 홀드 생성 → 만료 → 결제 확정 → 취소/환불로 이어지는 도메인 로직을 여기에 구현한다 (PRD FR-2~4, FR-6, FR-7).

- `lib/payments`, `lib/notifications`의 구현체에 직접 의존하지 않고 인터페이스로만 접근한다.
- 동일 객실·기간에 대한 동시 예약은 DB 레벨 제약(`EXCLUDE`)으로 차단하는 것을 전제로 설계한다 (PRD NFR).
