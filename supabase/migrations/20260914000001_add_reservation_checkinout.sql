-- 프런트 데스크 체크인/체크아웃 처리 시각. null이면 아직 처리 전.
-- 체크아웃은 반드시 체크인 이후에만 유효하므로, 체크아웃이 찍혀 있는데 체크인이 비어있는 상태는 허용하지 않는다.
alter table reservations
  add column checked_in_at timestamptz,
  add column checked_out_at timestamptz;

alter table reservations
  add constraint chk_reservations_checkout_after_checkin
  check (checked_out_at is null or checked_in_at is not null);
