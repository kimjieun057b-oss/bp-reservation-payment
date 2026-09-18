# 옵션 상품(addons) 기능 설계

**날짜**: 2026-09-18
**배경**: 현재 예약은 객실/날짜/인원/총액만 다루고, 온수풀/바베큐세트 같은 별도 옵션 상품 구조가 없다. 예약 과정에서 옵션을 선택하면 추가금액이 발생하는 기능을 추가한다.

## 범위

- 옵션은 property 전체 공통(객실 타입 무관하게 동일한 옵션 목록 노출).
- 수량은 스테퍼(0~N)로 선택. 0이면 미선택.
- 옵션 금액은 `reservations.total_price`에 합산되어, 기존 환불 계산(`total_price × refund_percent`)을 그대로 재사용한다.
- 옵션 관리자 CRUD 화면은 이번 범위에서 제외한다(시드 데이터로만 제공).

## A. DB 스키마

```sql
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
  quantity int not null default 1 check (quantity > 0),
  price int not null,  -- 예약 시점 단가 스냅샷 (addons.price가 이후 바뀌어도 과거 예약엔 영향 없음)
  created_at timestamptz not null default now()
);

create index idx_reservation_addons_reservation on reservation_addons (reservation_id);
```

RLS는 기존 관리자 정책 패턴을 따른다:
- `addons`: `property_id = admin_property_id()`
- `reservation_addons`: `reservation_id in (select id from reservations where property_id = admin_property_id())`

마이그레이션은 기존 `supabase/migrations/20260907000001_init_schema.sql`에 이어지는 새 마이그레이션 파일로 추가한다 (기존 통합 파일을 수정하지 않음).

## B. 가격/총액 로직 (`lib/reservations/pricing.ts`)

```ts
export interface AddonSelection {
  addon_id: string;
  quantity: number;
}

export interface AddonLineItem {
  addon_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export async function resolveAddonSelections(
  supabase: SupabaseClient,
  propertyId: string,
  selections: AddonSelection[]
): Promise<{ total: number; items: AddonLineItem[] }>
```

- `quantity <= 0`인 항목은 무시.
- 조회된 addon이 없거나 `is_active=false`이거나 `property_id`가 다르면 `ADDON_NOT_FOUND` 에러.
- 반환된 `total`을 객실 숙박비 합계와 더해 최종 `total_price`를 만든다.

## C. `lib/reservations/hold.ts`

- `CreateHoldInput`에 `addons?: AddonSelection[]` 추가.
- `CreateHoldError`에 `ADDON_NOT_FOUND` 추가.
- 처리 순서: (1) 기존 로직대로 room_type/재고 검증 → (2) `resolveAddonSelections`로 옵션 검증 및 합계 계산 → (3) `total_price = roomTotal + addonsTotal`로 예약 INSERT 시도(기존 rooms 순회 로직 그대로) → (4) INSERT 성공 시 `reservation_addons`에 라인 항목 insert(각 row: `addon_id`, `quantity`, `price=unit_price`).
- addon 검증은 방 배정 루프 이전에 끝내므로, 방 배정 성공 이후의 `reservation_addons` insert 실패는 입력 데이터 문제가 아닌 예외 상황으로 간주해 그대로 throw한다(기존 코드 스타일과 동일하게 별도 롤백 로직은 두지 않는다).

## D. API

- **신규** `app/api/addons/route.ts` — `GET`: `is_active=true`인 addon 목록 반환 (`app/api/room-types/route.ts`와 동일 패턴, property 필터 없음).
- **변경** `app/api/reservations/hold/route.ts` — 요청 바디에서 `addons` 배열을 파싱해 `createHold`에 전달(선택 필드, 기본 `[]`). `ADDON_NOT_FOUND` 에러 → 404 응답 매핑 추가.
- **변경** `app/api/reservations/[id]/route.ts` — select에 `reservation_addons(quantity, price, addons(name))` 추가.

## E. UI

- `components/reservation/BookingCalendar.tsx`:
  - `/api/addons`에서 옵션 목록을 불러와 상태로 보관.
  - 옵션마다 이름/단가/수량 스테퍼(0~N, 기본 0)를 렌더링하는 섹션 추가(고객정보 입력 카드와 합계 카드 사이).
  - 합계 카드에 "객실 요금" / "옵션 요금" / "합계"를 구분 표시.
  - `handleSubmit`에서 `quantity > 0`인 옵션만 `addons` 배열로 hold API에 전송.
- `components/reservation/CheckoutPanel.tsx`:
  - `ReservationDetail`에 `reservation_addons: { quantity: number; price: number; addons: { name: string } | null }[]` 추가.
  - 결제 요약의 "결제 금액" 위에 옵션 라인(이름 × 수량 = 금액)을 나열.

## F. seed.sql

`addons` insert 추가 (`property_id = '00000000-0000-0000-0000-000000000001'`):

| name | price |
|---|---|
| 온수풀 이용권 | 30,000원 |
| 바베큐 세트 | 25,000원 |
| 모닥불 세트 | 20,000원 |
| 조식 도시락 | 10,000원 |
| 웰컴 세트 | 15,000원 |

## G. 문서 반영

`docs/예약결제시스템_DB스키마_API설계.md`:
- ERD 개요에 `properties └─ addons`, `reservations ── reservation_addons` 추가.
- 2장에 `2-x. addons`, `2-y. reservation_addons` 스키마 절 추가.
- 4-1 고객용 API 표에 `GET /addons` 행 추가, `POST /reservations/hold` 요청 예시에 `addons` 필드 추가.

## 테스트

- `lib/reservations/pricing.test.ts`에 `resolveAddonSelections` 케이스 추가(정상 합산, 비활성 addon, quantity 0 무시, 존재하지 않는 addon_id).
- 기존 `hold.concurrency.test.ts`는 addon 없는 기존 흐름을 그대로 검증하므로 변경 불필요(회귀 확인용으로 유지).
