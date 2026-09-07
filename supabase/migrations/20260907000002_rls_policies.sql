-- RLS: 관리자는 자신이 속한 property 데이터만 접근 가능.
-- 고객용 예약/결제 흐름은 서버 Route Handler가 service role 키로 처리하므로 RLS를 우회한다
-- (예약결제시스템_DB스키마_API설계.md 2-11 참고). 즉 아래 정책은 "Supabase 클라이언트로 직접 접근하는
-- 관리자 세션"에만 적용되고, anon key로는 어떤 테이블도 기본적으로 접근 불가하다 (정책 없음 = 전체 차단).

create or replace function admin_property_id()
returns uuid
language sql
security definer
stable
as $$
  select property_id from admin_users where id = auth.uid()
$$;

alter table properties enable row level security;
alter table room_types enable row level security;
alter table rooms enable row level security;
alter table price_rules enable row level security;
alter table reservations enable row level security;
alter table payments enable row level security;
alter table refund_policies enable row level security;
alter table notification_logs enable row level security;
alter table admin_users enable row level security;

create policy "admin reads own row" on admin_users
  for select using (id = auth.uid());

create policy "admin manages own property" on properties
  for all using (id = admin_property_id());

create policy "admin manages own room_types" on room_types
  for all using (property_id = admin_property_id());

create policy "admin manages own rooms" on rooms
  for all using (
    room_type_id in (select id from room_types where property_id = admin_property_id())
  );

create policy "admin manages own price_rules" on price_rules
  for all using (
    room_type_id in (select id from room_types where property_id = admin_property_id())
  );

create policy "admin manages own refund_policies" on refund_policies
  for all using (property_id = admin_property_id());

create policy "admin reads own reservations" on reservations
  for all using (property_id = admin_property_id());

create policy "admin reads own payments" on payments
  for all using (
    reservation_id in (select id from reservations where property_id = admin_property_id())
  );

create policy "admin reads own notification_logs" on notification_logs
  for all using (
    reservation_id in (select id from reservations where property_id = admin_property_id())
  );
