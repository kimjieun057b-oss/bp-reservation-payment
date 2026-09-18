-- 옵션 상품(addons) 및 예약별 옵션 선택 내역(reservation_addons).
-- 설계문서: docs/superpowers/specs/2026-09-18-addon-products-design.md
-- property 전체 공통으로 노출되며, addons.price가 이후 바뀌어도 이미 만들어진 예약에는
-- 영향이 없도록 reservation_addons.price에 예약 시점 단가를 스냅샷으로 저장한다.

create table addons (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,
  description text,
  price int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table reservation_addons (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  addon_id uuid not null references addons(id),
  quantity int not null default 1,
  price int not null,
  created_at timestamptz not null default now(),

  constraint chk_reservation_addons_quantity check (quantity > 0)
);

create index idx_reservation_addons_reservation on reservation_addons (reservation_id);

alter table addons enable row level security;
alter table reservation_addons enable row level security;

create policy "admin manages own addons" on addons
  for all using (property_id = admin_property_id());

create policy "admin manages own reservation_addons" on reservation_addons
  for all using (
    reservation_id in (select id from reservations where property_id = admin_property_id())
  );
