# 펜션·민박·캠핑장 예약+결제 시스템 — DB 스키마 & API 설계 문서

**기술스택**: Next.js 14+ (App Router) / TypeScript / Tailwind CSS / Supabase (PostgreSQL)
**예약 방식**: 즉시확정형 (결제 완료 = 예약 확정)

---

## 0. 기술스택 검토 — 왜 Supabase(PostgreSQL)인가

| 후보 | 장점 | 단점 / 이 프로젝트와의 적합성 |
|---|---|---|
| **Supabase (PostgreSQL)** ✅ 추천 | Next.js와 궁합 좋음, `daterange` + `EXCLUDE` 제약으로 **DB 레벨에서 이중예약을 원천 차단** 가능, Realtime으로 잔여객실 실시간 반영, RLS로 고객/관리자 권한 분리 용이, Auth 내장 | 트래픽 매우 커지면(수만 동접) 별도 스케일링 설계 필요 — 펜션/캠핑장 규모에서는 해당 없음 |
| PlanetScale (MySQL) | 스케일링 강점 | 외래키·`EXCLUDE` 제약 미지원 → 예약 중복 방지를 애플리케이션 레벨에서 직접 구현해야 해서 동시성 버그 위험 증가 |
| Firebase (Firestore) | 실시간, 서버리스 친화 | NoSQL이라 "날짜 범위 겹침 방지" 같은 관계형 제약을 걸 수 없음, 트랜잭션 설계가 오히려 더 복잡해짐 |
| 자체 PostgreSQL (EC2/RDS 등) | Supabase와 기능 동일, 완전한 커스터마이징 | 인증/실시간/스토리지를 직접 구축해야 해서 초기 개발 리소스 ↑ |

**결론**: 예약 시스템의 핵심 난이도는 "동시 예약 충돌 방지"인데, PostgreSQL의 `daterange` + `EXCLUDE USING gist` 제약을 쓰면 이 로직을 DB 엔진이 대신 보장해줍니다. Supabase는 이 기능을 그대로 쓰면서 Auth/Realtime/Storage까지 한 번에 해결되므로 이 프로젝트엔 가장 적합합니다.

---

## 1. ERD 개요

```
properties (숙소/캠핑장)
   └─ room_types (객실타입/사이트타입)
         └─ rooms (개별 객실·사이트 유닛)
               └─ reservations (예약) ── payments (결제)
                                     └─ notification_logs (알림발송기록)
   └─ price_rules (요금정책 - 성수기/주말 등)
   └─ refund_policies (환불정책)
   └─ admin_users (운영자 계정)
```

---

## 2. DB 스키마 (PostgreSQL / Supabase)

### 2-1. 사전 준비

```sql
-- 날짜범위 겹침 제약을 위해 필요
create extension if not exists btree_gist;
```

### 2-2. properties — 숙소/캠핑장 기본정보

```sql
create table properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,                        -- 상호명
  business_reg_no text,                      -- 사업자등록번호
  online_sales_reg_no text,                  -- 통신판매업 신고번호
  address text,                              -- 주소
  phone text,                                -- 연락처
  checkin_time time not null default '15:00',
  checkout_time time not null default '11:00',
  description text,
  images jsonb default '[]',                 -- ["url1","url2", ...]
  created_at timestamptz not null default now()
);
```

### 2-3. room_types — 객실/사이트 타입 (카탈로그)

```sql
create table room_types (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null,                        -- 예: "디럭스 온돌룸", "A구역 오토캠핑"
  description text,
  capacity_standard int not null default 2,  -- 기준인원
  capacity_max int not null default 4,       -- 최대인원
  base_price int not null,                   -- 기준가(비수기 주중 등)
  extra_person_fee int default 0,            -- 인원 추가요금
  amenities jsonb default '[]',              -- ["에어컨","바베큐","전기"]
  images jsonb default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### 2-4. rooms — 개별 객실/사이트 유닛 (실제 예약 대상)

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references room_types(id) on delete cascade,
  name text not null,                        -- 예: "101호", "A-3"
  is_active boolean not null default true,   -- 점검/휴장 시 false
  created_at timestamptz not null default now()
);
```

> 💡 **설계 포인트**: 재고를 "타입별 날짜별 카운트" 대신 "개별 유닛(rooms)"으로 관리하면, 다음 예약 테이블에서 PostgreSQL의 `daterange` 겹침 제약(EXCLUDE)을 그대로 활용해 이중예약을 DB가 강제로 막아줍니다. 날짜별 재고 테이블을 미리 생성해둘 필요가 없어 관리도 단순해집니다.

### 2-5. price_rules — 요금 정책 (성수기/주말 등)

```sql
create table price_rules (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references room_types(id) on delete cascade,
  name text not null,                        -- "여름 성수기", "주말 요금"
  start_date date,                           -- 특정기간 정책 (null이면 요일 정책)
  end_date date,
  days_of_week int[],                        -- [5,6] = 금,토 (0=일 ~ 6=토)
  price int not null,
  priority int not null default 0,           -- 우선순위 (특정기간 > 요일 일반)
  created_at timestamptz not null default now()
);
```

### 2-6. reservations — 예약 (핵심 테이블)

```sql
create type reservation_status as enum (
  'HOLD',            -- 임시 홀드 (결제 진행 중)
  'CONFIRMED',        -- 결제완료·예약확정
  'CANCELLED',         -- 고객/관리자 취소
  'EXPIRED'           -- 홀드 시간 초과로 자동 만료
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  room_type_id uuid not null references room_types(id), -- 조회 편의를 위한 비정규화
  property_id uuid not null references properties(id),

  check_in date not null,
  check_out date not null,
  stay_range daterange generated always as
    (daterange(check_in, check_out, '[)')) stored,       -- [체크인, 체크아웃) 반열린구간

  guest_name text not null,
  guest_phone text not null,
  guest_email text,
  guest_count int not null default 1,
  memo text,                                 -- 고객 요청사항

  status reservation_status not null default 'HOLD',
  hold_expire_at timestamptz,                -- HOLD 상태일 때만 값 존재

  total_price int not null,
  cancelled_at timestamptz,
  cancel_reason text,
  refund_amount int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_dates check (check_out > check_in),

  -- 🔒 핵심 제약: 같은 room_id에서 HOLD/CONFIRMED 상태끼리는 날짜가 겹칠 수 없음
  exclude using gist (
    room_id with =,
    stay_range with &&
  ) where (status in ('HOLD', 'CONFIRMED'))
);

create index idx_reservations_room_range on reservations using gist (room_id, stay_range);
create index idx_reservations_status on reservations (status);
create index idx_reservations_hold_expire on reservations (hold_expire_at) where status = 'HOLD';
```

> ⚠️ 이 `exclude` 제약이 있으면 애플리케이션 코드에 버그가 있어도 **DB가 물리적으로 이중예약 INSERT를 거부**합니다. 동시성 이슈의 90%를 여기서 해결합니다.

### 2-7. payments — 결제 정보

```sql
create type payment_status as enum ('READY', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIAL_REFUNDED');

create table payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  order_id text not null unique,             -- 멱등성 키 (PG 요청 시 발급하는 고유 주문번호)
  pg_provider text not null,                 -- 'toss', 'inicis', 'nice' 등
  pg_transaction_id text,                    -- PG사 거래번호 (콜백 후 채움)
  amount int not null,
  status payment_status not null default 'READY',
  method text,                               -- 카드/계좌이체/간편결제 등
  paid_at timestamptz,
  raw_response jsonb,                        -- PG 콜백 원본 (디버깅/정산대사용)
  created_at timestamptz not null default now()
);

create unique index idx_payments_order_id on payments (order_id);
```

### 2-8. refund_policies — 환불 규정

```sql
create table refund_policies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  days_before int not null,                  -- 체크인 며칠 전
  refund_percent int not null,               -- 환불 비율(%)
  created_at timestamptz not null default now()
);
-- 예: (7일전, 100%), (3일전, 50%), (0일전/당일, 0%)
```

### 2-9. notification_logs — 알림 발송 기록

```sql
create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  channel text not null,                     -- 'sms', 'kakao_alimtalk', 'mail'
  template text not null,                    -- 'RESERVATION_CONFIRMED' 등
  status text not null default 'PENDING',    -- PENDING/SENT/FAILED
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 2-10. admin_users — 운영자 계정 (Supabase Auth 연동)

```sql
create table admin_users (
  id uuid primary key references auth.users(id),
  property_id uuid references properties(id),
  role text not null default 'owner',        -- owner / staff
  name text,
  created_at timestamptz not null default now()
);
```

### 2-11. RLS (Row Level Security) 정책 개요

- `reservations`, `payments`: 고객은 자신의 예약(전화번호+예약번호 조합 조회용 별도 API)만 접근, 직접 테이블 접근은 차단하고 **서버(Route Handler/Edge Function)를 통해서만** 접근하도록 설계 권장
- `admin_users`가 속한 `property_id`의 데이터만 관리자 조회 가능하도록 RLS 정책 적용
- 결제 관련 테이블은 클라이언트에서 직접 쓰기 금지 → 반드시 서버사이드(webhook, API Route)에서만 insert/update

---

## 3. 예약 상태 흐름도

```
[재고 조회]
    │
    ▼
[HOLD 생성] ──(exclude 제약 통과 시에만 성공)
    │  hold_expire_at = now() + 10분
    ▼
[PG 결제창 진입]
    │
    ├─ 결제 성공 웹훅 수신 ──▶ [CONFIRMED] ──▶ 알림 발송
    │
    ├─ 결제 실패/취소 ──▶ [EXPIRED] (즉시 반환)
    │
    └─ 시간 초과 (10분) ──▶ 스케줄러가 [EXPIRED]로 자동 전환
```

---

## 4. API 설계

Base URL: `/api`
인증: 고객용 API는 세션리스(예약번호+전화번호 검증), 관리자용 API는 Supabase Auth 세션 필요

### 4-1. 고객용 (Public)

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/room-types?property_id=` | 객실/사이트 타입 목록 |
| GET | `/room-types/:id` | 객실 타입 상세 (요금정책 포함) |
| GET | `/availability?room_type_id=&check_in=&check_out=` | 해당 기간 예약 가능 객실 수·가격 조회 |
| POST | `/reservations/hold` | 임시 홀드 생성 (아래 상세) |
| GET | `/reservations/:id` | 예약 상태 조회 (홀드 만료 카운트다운용 polling) |
| DELETE | `/reservations/:id/hold` | 사용자가 취소 버튼 클릭 시 홀드 즉시 해제 |
| POST | `/payments/checkout` | PG 결제창 호출을 위한 파라미터 발급 |
| POST | `/payments/webhook/:provider` | **PG사 → 서버** 결제결과 콜백 (서버간 통신) |
| GET | `/my-reservations?phone=&reservation_no=` | 고객 예약 조회 (비회원용) |
| POST | `/reservations/:id/cancel` | 고객 취소 요청 (환불 규정 자동 계산) |

**POST /reservations/hold 요청/응답 예시**

```json
// Request
{
  "room_type_id": "uuid",
  "check_in": "2026-09-20",
  "check_out": "2026-09-22",
  "guest_name": "홍길동",
  "guest_phone": "010-1234-5678",
  "guest_count": 2
}

// Response 201
{
  "reservation_id": "uuid",
  "status": "HOLD",
  "hold_expire_at": "2026-08-31T10:10:00+09:00",
  "total_price": 180000
}

// Response 409 (동시 예약 충돌 - exclude 제약 위반)
{
  "error": "ROOM_UNAVAILABLE",
  "message": "선택하신 날짜는 이미 예약이 진행 중입니다."
}
```

**내부 로직 순서** (Route Handler / Edge Function)
1. 해당 room_type의 `is_active=true`인 rooms 중 해당 기간에 겹치는 예약이 없는 room을 조회
2. 그 room_id로 `reservations` INSERT (status='HOLD', hold_expire_at=now()+10분)
   → 이 INSERT가 `exclude` 제약에 걸리면 자동으로 409 에러 반환 (재시도 또는 다른 room으로 자동 폴백 가능)
3. 성공 시 order_id 발급 후 payments 테이블에 status='READY' row 생성

**POST /payments/webhook/:provider 처리 로직**

1. 서명 검증(PG사별 웹훅 시그니처 확인 필수)
2. `order_id`로 payments 조회 → **이미 status='PAID'면 즉시 200 반환 (멱등성 처리, 중복 확정 방지)**
3. 연결된 reservation의 `status`, `hold_expire_at` 확인
   - 이미 EXPIRED 상태라면 → 자동 환불 API 호출 + 고객 안내 알림 발송 + 로그 기록
   - 여전히 HOLD 상태라면 → 트랜잭션으로 `reservations.status='CONFIRMED'`, `payments.status='PAID'` 동시 업데이트
4. 알림 발송 큐에 등록 (예약확정 알림톡)
5. PG사에 200 OK 응답

### 4-2. 관리자용 (Admin, 인증 필요)

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/admin/reservations?status=&date_from=&date_to=` | 예약 목록/검색 |
| PATCH | `/admin/reservations/:id/cancel` | 관리자 강제 취소(환불 처리 포함) |
| GET | `/admin/dashboard/summary` | 오늘/이번주 예약, 매출 통계 |
| GET | `/admin/room-types` / POST / PATCH | 객실 타입 CRUD |
| GET | `/admin/rooms` / POST / PATCH | 개별 객실 유닛 CRUD |
| POST | `/admin/price-rules` | 요금 정책 등록 |
| GET | `/admin/payments?date_from=&date_to=` | 결제/정산 내역 (raw_response 대사용) |
| PATCH | `/admin/refund-policies` | 환불 규정 수정 |

### 4-3. 배치/스케줄러 (Cron)

| 실행주기 | 대상 | 처리 |
|---|---|---|
| 매 1분 | `hold_expire_at < now()` and `status='HOLD'` | → `status='EXPIRED'`로 일괄 전환 (Supabase Cron 또는 Vercel Cron) |
| 매일 08:00 | 체크인 D-1 예약 | 안내 알림톡 발송 |

---

## 5. 프론트엔드(Next.js) 구조 제안

```
/app
  /(public)
    /rooms/[id]/page.tsx        # 객실 상세 + 예약 캘린더
    /checkout/[reservationId]/page.tsx  # 결제 페이지 (holdExpireAt 카운트다운 표시)
    /my-reservations/page.tsx
  /admin
    /dashboard/page.tsx
    /reservations/page.tsx
    /room-types/page.tsx
  /api
    /reservations/hold/route.ts
    /payments/webhook/[provider]/route.ts
    ...
```

- 예약 캘린더는 `availability` API로 날짜별 잔여 여부만 받아 표시 (Supabase Realtime 구독 시 다른 사용자의 실시간 예약 현황도 반영 가능)
- 결제 페이지 진입 시 `hold_expire_at` 기준 클라이언트 카운트다운 타이머 표시 → 만료 임박 시 재확인 유도

---

## 6. 남은 결정 사항 (클라이언트 확인 필요)

- [O] PG사 선정 (토스페이먼츠 / KG이니시스 / 나이스페이먼츠 등) --> PortOne API - 토스페이먼츠 사용
- [O] 환불 규정 상세 기준 (일자별 %) --> DEC-002 참고 (D-7:100%, D-5:70%, D-3:50%, D-1:30%, 당일:0%), `supabase/seed.sql`
- [O] 홀드 유지시간 (기본 제안: 10분) --> 10분
- [O] 알림톡 발신 프로필 등록 여부 (카카오 비즈니스 채널 필요) --> 카카오 사용X, 메일 알림
- [O] 객실/사이트별 재고 수량 및 초기 데이터 --> DEC-003 참고 (디럭스 5실/스탠다드 8실/캠핑사이트 10면), `supabase/seed.sql`
- [O] 성수기/주말 등 요금 정책 예시값 --> DEC-004 참고, `supabase/seed.sql`
