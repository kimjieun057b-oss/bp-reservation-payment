# 숙박·레저 예약+결제 시스템 보일러플레이트

펜션·민박·캠핑장 등 소규모 숙박·레저 사업자를 위한 예약+결제 시스템을 **매 프로젝트마다 처음부터 만들지 않기 위한 Next.js 보일러플레이트**입니다.

예약 홀드 → 결제 → 확정의 전체 플로우, 이중예약 방지(DB 레벨 제약), PG 연동 추상화, 관리자 페이지가 이미 구현되어 있습니다. 신규 프로젝트는 이 저장소를 fork해서 브랜딩·콘텐츠·세부 정책만 커스터마이징하는 것을 전제로 합니다.

> 요구사항/설계 배경은 [`docs/PRD.md`](docs/PRD.md), 개발 중 주요 의사결정(AI 제안을 어떻게 검토·채택/기각했는지)은 [`docs/DECISIONS.md`](docs/DECISIONS.md)에 기록되어 있습니다. DB 스키마·API 상세 명세는 [`docs/예약결제시스템_DB스키마_API설계.md`](docs/예약결제시스템_DB스키마_API설계.md)를 기준으로 합니다.

---

## 핵심 특징

- **예약 홀드 → 결제 → 확정 플로우**: 결제 진행 중에는 홀드로 재고를 잡아두고, 결제 웹훅 수신 시 자동으로 확정 처리 (즉시확정 모델)
- **이중예약 방지**: 애플리케이션 로직이 아니라 PostgreSQL `EXCLUDE` 제약으로 동일 객실·기간 동시예약을 DB 레벨에서 원천 차단
- **PG 연동 추상화**: `PaymentProvider` 인터페이스로 결제 검증/웹훅/환불을 분리 — PG사를 교체해도 예약 도메인 로직(`lib/reservations`)은 수정하지 않음
- **환불 규정 엔진**: 체크인 D-n일 전 → 환불율(%) 테이블(`refund_policies`) 기반으로 환불액 자동 계산, 관리자 수동 환불 예외 경로도 존재
- **관리자 페이지**: 예약 관리(조회/강제취소), 객실·요금 관리(CRUD, 점검 처리), 대시보드(매출/환불/오늘·이번주 예약 수)
- **비회원 예약**: 회원가입 없이 예약번호+전화번호로 조회/취소 (본인 확인은 예약 시 입력 정보와의 대조 방식, [DEC-006](docs/DECISIONS.md) 참고)
- **홀드 자동 만료 배치**: 만료된 홀드를 주기적으로 정리 (Cron + 요청 시점 lazy expiration 보정)

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Frontend/Backend | Next.js (App Router), TypeScript, Tailwind CSS |
| DB/Auth | Supabase (PostgreSQL, Supabase Auth) |
| 결제 | PortOne V2 (`@portone/server-sdk`, `@portone/browser-sdk`) — `PaymentProvider` 인터페이스로 추상화되어 있어 다른 PG사로 교체 가능 |
| 배치 | Vercel Cron + GitHub Actions (아래 [배치(Cron) 설정](#배치cron-설정) 참고) |
| 테스트 | Vitest |
| 배포 | Vercel (프로젝트별로 완전히 분리된 Supabase 프로젝트 사용을 전제) |

---

## 폴더 구조

```
/app
  /(public)          # 고객용 페이지 (예약/결제, 예약 조회, 안내)
  /admin             # 관리자 페이지 (Supabase Auth 세션 필요, proxy.ts에서 보호)
  /api               # Route Handlers
    /admin           # 관리자 전용 API (예약/객실/요금/대시보드, proxy.ts에서 보호)
    /reservations    # 고객 예약(홀드/취소/조회) API
    /payments        # PG 웹훅
    /cron            # 배치용 엔드포인트
/lib
  /reservations      # 홀드/확정/만료/취소/환불 핵심 도메인 로직 (PG·알림 구현체에 직접 의존하지 않음)
  /payments          # PaymentProvider 인터페이스 + PortOne 구현체
  /notifications     # NotificationChannel 인터페이스 (메일, 구현 중)
  /supabase          # Supabase 클라이언트 (브라우저/서버)
/supabase
  /migrations        # DB 스키마 마이그레이션 (버전관리)
  seed.sql           # 샘플 데이터 (플레이스홀더 — fork 시 교체 전제)
/config
  site.ts            # fork 시 브랜드명/연락처 등을 채우는 단일 지점
/docs                # PRD, 의사결정 로그, DB/API 설계 문서
```

> 핵심 원칙: `lib/reservations`(예약 도메인 로직)는 `lib/payments`, `lib/notifications` 구현체에 직접 의존하지 않고 인터페이스로만 접근합니다. PG사·알림 채널을 교체해도 도메인 로직은 수정하지 않는 것이 목표입니다.

---

## 시작하기

### 요구사항
- Node.js 20 이상
- Supabase 프로젝트 1개 (신규 프로젝트마다 별도 Supabase 프로젝트 사용을 권장 — 멀티테넌시 대신 완전 분리 방식으로 결정됨, `docs/PRD.md` 10장 참고)

### 1. 설치

```bash
npm install
```

### 2. 환경변수

`.env.example`을 `.env`로 복사한 뒤 아래 값을 채웁니다. `.env`는 `.gitignore`에 포함되어 있으므로 실수로 커밋되지 않지만, 그렇더라도 **비밀번호·API 시크릿 등은 `.env` 파일 안에 주석으로도 남기지 마세요** — 필요한 메모는 별도 노트/비밀번호 관리자에 보관하고, `.env`에는 `KEY=value` 형태의 환경변수만 두는 것을 원칙으로 합니다.

```bash
cp .env.example .env
```

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (클라이언트/미들웨어 인증용) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (서버 Route Handler에서 RLS 우회용, 절대 클라이언트에 노출 금지) |
| `NEXT_PUBLIC_PORTONE_STORE_ID` / `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` | PortOne 브라우저 SDK 결제창 호출용 |
| `PORTONE_SECRET` | PortOne 서버 API(결제 조회/환불) 인증용 |
| `PORTONE_WEBHOOK_SECRET` | PortOne 웹훅 서명 검증용 |
| `CRON_SECRET` | `/api/cron/*` 엔드포인트 보호용 Bearer 토큰 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `EMAIL_USER` / `RECEIVER_EMAIL` | 메일 발송(알림 채널) 연동용 |

### 3. Supabase 스키마 적용

`supabase/migrations/20260907000001_init_schema.sql` 하나에 테이블·제약·인덱스·RLS 정책이 모두 통합되어 있습니다. Supabase SQL Editor(또는 Supabase CLI `db push`)에서 이 파일 하나만 실행하면 스키마 적용이 끝납니다.

> 원래는 기본 스키마 / RLS / 객실 점검 컬럼 / 체크인·체크아웃 컬럼이 4개 파일로 나뉜 순차 마이그레이션이었지만, 신규 프로젝트가 매번 순서대로 4번 적용해야 하는 번거로움을 없애기 위해 하나로 통합했습니다. 이후 스키마를 변경할 때는 이 파일을 계속 고쳐 쓰지 말고, 새 마이그레이션 파일을 추가하는 방식(날짜순 파일명)으로 이어가세요.

필요하면 `supabase/seed.sql`로 샘플 데이터(샘플 펜션/객실/요금/환불 규정)를 넣어 로컬에서 바로 예약 플로우를 테스트할 수 있습니다. **이 샘플 데이터는 플레이스홀더이므로 실서비스 전 반드시 교체해야 합니다** (배경은 `docs/DECISIONS.md`의 DEC-002~004 참고).

### 4. 관리자 계정 만들기

공개 회원가입이 없으므로 관리자 계정은 직접 발급합니다.

1. Supabase Dashboard → Authentication에서 관리자용 사용자를 생성
2. `admin_users` 테이블에 해당 사용자의 `id`(auth.users.id)와 `property_id`를 매칭하는 행을 추가

이 매칭이 있어야 관리자 페이지(`/admin`)의 RLS 정책이 정상 동작합니다.

### 5. 로컬 실행

```bash
npm run dev
```

`/admin` 및 `/api/admin`은 `proxy.ts`가 Supabase Auth 세션을 확인하며, 세션이 없으면 페이지는 `/login`으로 리다이렉트, API는 401을 반환합니다.

---

## 배치(Cron) 설정

FR-12(홀드 자동 만료)는 세 겹으로 보완되어 있습니다.

1. **GitHub Actions** (`.github/workflows/expire-holds-cron.yml`): 매시 정각마다 `/api/cron/expire-holds`를 호출 (Vercel Hobby 플랜이 1분 주기 Cron을 지원하지 않아 도입)
2. **Vercel Cron** (`vercel.json`): 하루 1회 동일 엔드포인트를 호출하는 보조 수단
3. **실시간 보정(lazy expiration)**: 가용성 조회, 홀드 생성, 관리자 예약 목록 조회 등 주요 API가 응답 전에 `expireDueHolds()`를 함께 호출해 스케줄러 지연과 무관하게 최신 상태를 보장

배포 후 GitHub 저장소 Settings → Secrets에 `APP_URL`(배포 도메인)과 `CRON_SECRET`(Vercel 환경변수와 동일한 값)을 등록해야 GitHub Actions가 동작합니다.

---

## 테스트

```bash
npm run test        # 1회 실행
npm run test:watch  # watch 모드
```

- `lib/reservations/pricing.test.ts`, `refund.test.ts`: 순수 함수 단위 테스트 (항상 실행)
- `lib/reservations/hold.concurrency.test.ts`: 동일 재고에 동시 홀드 요청 2건을 보내 **1건만 성공**하는지 검증하는 통합 테스트 (NFR "동시성" 항목). 실제 Supabase 프로젝트 + `SUPABASE_SERVICE_ROLE_KEY` 등 환경변수가 필요하며, 없으면 자동으로 skip됩니다.

---

## 신규 프로젝트로 fork할 때 커스터마이징 지점

| 항목 | 위치 |
|---|---|
| 브랜드명/연락처/OG 정보 | `config/site.ts` (이 파일만 채우면 됨) |
| 객실/사이트 실 데이터, 사진, 콘텐츠 | `supabase/seed.sql` 교체 (또는 관리자 페이지에서 직접 등록) |
| 요금 정책(성수기/주말 가격) | `price_rules` 테이블 데이터 (관리자 페이지 CRUD, 코드 변경 불필요) |
| 환불 규정(D-n일 전 → 환불율) | `refund_policies` 테이블 데이터 |
| PG사 교체 | `lib/payments`에 `PaymentProvider` 인터페이스 구현체 추가 |
| 알림 채널 추가(문자/카카오 등) | `lib/notifications`에 `NotificationChannel` 인터페이스 구현체 추가 (v1은 메일만 기본 제공) |
| 프로젝트별 커스텀 필드 | 기존 컬럼을 직접 변경하지 않고 각 테이블의 `metadata jsonb` 컬럼 우선 활용 |

브랜딩/객실 데이터/PG 실연동 키/프로모션 로직 등은 보일러플레이트가 값을 정해주지 않는 영역입니다 (자세한 In-scope/Out-of-scope 구분은 `docs/PRD.md` 4장 참고).

---

## 기능 구현 현황

기능 요구사항 전체 목록과 완료 기준(AC)은 [`docs/PRD.md`](docs/PRD.md) 5장에 체크리스트로 관리됩니다. 요약하면:

| 영역 | 상태 |
|---|---|
| 예약 조회/홀드/확정/취소 (FR-1~4) | 구현 완료 (홀드 자동 만료 배치 포함) |
| PG 연동 추상화, 웹훅 멱등성, 환불 처리 (FR-5~7) | 구현 완료 |
| 관리자 예약/객실/요금 관리 (FR-8, FR-9) | 구현 완료 (유닛 수동 재배정 UI는 v1 범위 제외) |
| 관리자 대시보드 (FR-10) | 매출/환불/순매출 요약 + 오늘·이번주 예약 수 구현 (예약 수 카드는 클릭 시 해당 예약 목록으로 드릴다운) |
| 알림 발송 어댑터 (FR-11) | 인터페이스만 정의됨, 메일 발송/재시도/로그 연동은 진행 중 |
| 홀드 자동 만료 배치 (FR-12) | 구현 완료 |

승인제 예약, 다국어 UI, 회원가입 기반 계정, 쿠폰/프로모션, 멀티 지점 통합 대시보드는 v1 범위에서 명시적으로 제외되어 있습니다 (`docs/PRD.md` 11장).

---

## 참고 문서

- [`docs/PRD.md`](docs/PRD.md) — 목적, 범위, 기능 요구사항(FR), 비기능 요구사항(NFR), 마일스톤, 오픈 이슈
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — 개발 중 주요 의사결정 로그 (AI 제안 → 검토 → 최종 결정 과정을 기록)
- [`docs/예약결제시스템_DB스키마_API설계.md`](docs/예약결제시스템_DB스키마_API설계.md) — DB 스키마/API 상세 명세
- [`lib/reservations/README.md`](lib/reservations/README.md) — 예약 도메인 로직 파일 구성 설명
