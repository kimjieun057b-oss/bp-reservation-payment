// FR-12: 만료된 홀드를 자동 해제하는 배치 엔드포인트.
// Vercel Hobby 플랜은 1분 주기 Cron을 지원하지 않으므로(Pro 플랜부터 가능),
// - 1차: GitHub Actions(.github/workflows/expire-holds-cron.yml)가 시간마다 이 엔드포인트를 호출한다.
// - 2차 보조: Vercel Cron이 하루 1회(vercel.json) 동일 엔드포인트를 호출한다.
// - 실시간 보정: 가용성 조회/홀드 생성/관리자 목록 조회 등 주요 API가 응답 전에 expireDueHolds()를 함께 호출해
//   외부 스케줄러 지연과 무관하게 실제 사용 시점 기준으로는 최신 상태를 보장한다.
import { NextResponse } from "next/server";
import { expireDueHolds } from "@/lib/reservations";

export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    try {
        const expiredIds = await expireDueHolds();
        return NextResponse.json({ ok: true, expired_count: expiredIds.length, expired_ids: expiredIds });
    } catch (err) {
        // FR-12 AC2: 배치 실행 실패 시 로그를 남긴다(모니터링 연동은 범위 밖).
        console.error("[GET /api/cron/expire-holds]", err);
        return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
}
