-- FR-9 AC2: 객실 유닛을 "특정 시작일부터(선택적으로 종료일까지)" 점검(예약 불가) 처리하기 위한 컬럼.
-- blocked_from이 null이면 점검 예정 없음. blocked_until이 null이면 관리자가 수동으로 해제할 때까지 무기한 점검.
alter table rooms
  add column blocked_from date,
  add column blocked_until date;

alter table rooms
  add constraint chk_rooms_blocked_range
  check (blocked_until is null or blocked_from is null or blocked_until > blocked_from);
