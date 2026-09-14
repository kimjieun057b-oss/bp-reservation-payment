-- 통합 스키마 (예약결제시스템_DB스키마_API설계.md 기준)
-- 원래 4개 파일(init_schema / rls_policies / add_room_blocking / add_reservation_checkinout)로 나뉘어 있던
-- 마이그레이션을 신규 프로젝트가 한 번에 적용할 수 있도록 하나로 통합한 버전.
-- 이중예약 방지를 위한 daterange + EXCLUDE 제약이 핵심이다.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- exclude constraint에서 uuid '=' 연산자 사용을 위해 필요

-- 2-2. properties
create table properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_reg_no text,
  online_sales_reg_no text,
  address text,
  phone text,
  checkin_time time not null default '15:00',
  checkout_time time not null default '11:00',
  description text,
  images jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 2-3. room_types
create table room_types (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  description text,
  capacity_standard int not null default 2,
  capacity_max int not null default 4,
  base_price int not null,
  extra_person_fee int not null default 0,
  amenities jsonb not null default '[]',
  images jsonb not null default '[]',
  is_active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 2-4. rooms (개별 유닛 = 실제 예약 대상)
-- blocked_from/blocked_until: FR-9 AC2 점검(예약 불가) 처리용.
-- blocked_from이 null이면 점검 예정 없음. blocked_until이 null이면 관리자가 수동으로 해제할 때까지 무기한 점검.
create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references room_types(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  blocked_from date,
  blocked_until date,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),

  constraint chk_rooms_blocked_range
    check (blocked_until is null or blocked_from is null or blocked_until > blocked_from)
);

-- 2-5. price_rules (성수기/주말 등 요금 정책)
create table price_rules (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references room_types(id) on delete cascade,
  name text not null,
  start_date date,          -- 특정 기간 정책 (null이면 요일 기반 정책)
  end_date date,
  days_of_week int[],       -- [5,6] = 금,토 (0=일 ~ 6=토)
  price int not null,
  priority int not null default 0,  -- 값이 클수록 우선 적용 (특정기간 성수기 > 요일 주말 > base_price)
  created_at timestamptz not null default now(),

  constraint chk_price_rule_scope check (
    (start_date is not null and end_date is not null and days_of_week is null)
    or (start_date is null and end_date is null and days_of_week is not null)
  )
);

-- 2-6. reservations (핵심 테이블)
create type reservation_status as enum (
  'HOLD',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED'
);

-- checked_in_at/checked_out_at: 프런트 데스크 체크인/체크아웃 처리 시각. null이면 아직 처리 전.
-- 체크아웃은 반드시 체크인 이후에만 유효하므로, 체크아웃이 찍혀 있는데 체크인이 비어있는 상태는 허용하지 않는다.
create table reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  room_type_id uuid not null references room_types(id),
  property_id uuid not null references properties(id),

  check_in date not null,
  check_out date not null,
  stay_range daterange generated always as
    (daterange(check_in, check_out, '[)')) stored,

  guest_name text not null,
  guest_phone text not null,
  guest_email text,
  guest_count int not null default 1,
  memo text,

  status reservation_status not null default 'HOLD',
  hold_expire_at timestamptz,

  total_price int not null,
  cancelled_at timestamptz,
  cancel_reason text,
  refund_amount int,

  checked_in_at timestamptz,
  checked_out_at timestamptz,

  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_dates check (check_out > check_in),
  constraint chk_reservations_checkout_after_checkin
    check (checked_out_at is null or checked_in_at is not null),

  -- 핵심 제약: 같은 room_id에서 HOLD/CONFIRMED 상태끼리는 날짜가 겹칠 수 없음
  exclude using gist (
    room_id with =,
    stay_range with &&
  ) where (status in ('HOLD', 'CONFIRMED'))
);

create index idx_reservations_room_range on reservations using gist (room_id, stay_range);
create index idx_reservations_status on reservations (status);
create index idx_reservations_hold_expire on reservations (hold_expire_at) where status = 'HOLD';
create index idx_reservations_property on reservations (property_id);

-- 2-7. payments
create type payment_status as enum ('READY', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIAL_REFUNDED');

create table payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  order_id text not null unique,  -- 웹훅 멱등성 키
  pg_provider text not null,      -- 'toss' 등 (PortOne 경유)
  pg_transaction_id text,
  amount int not null,
  status payment_status not null default 'READY',
  method text,
  paid_at timestamptz,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create index idx_payments_reservation on payments (reservation_id);

-- 2-8. refund_policies (환불 규정: 체크인 D-n일 전 -> 환불 비율)
create table refund_policies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  days_before int not null,
  refund_percent int not null check (refund_percent between 0 and 100),
  created_at timestamptz not null default now(),

  unique (property_id, days_before)
);

-- 2-9. notification_logs (v1: 메일만 사용. channel='mail' 이외 값은 추후 문자/카카오 확장용)
create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  channel text not null default 'mail',
  template text not null,
  status text not null default 'PENDING',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_notification_logs_reservation on notification_logs (reservation_id);

-- 2-10. admin_users (Supabase Auth 연동)
create table admin_users (
  id uuid primary key references auth.users(id),
  property_id uuid references properties(id),
  role text not null default 'owner',
  name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: 관리자는 자신이 속한 property 데이터만 접근 가능.
-- 고객용 예약/결제 흐름은 서버 Route Handler가 service role 키로 처리하므로 RLS를 우회한다
-- (예약결제시스템_DB스키마_API설계.md 2-11 참고). 즉 아래 정책은 "Supabase 클라이언트로 직접 접근하는
-- 관리자 세션"에만 적용되고, anon key로는 어떤 테이블도 기본적으로 접근 불가하다 (정책 없음 = 전체 차단).
-- ---------------------------------------------------------------------------

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
