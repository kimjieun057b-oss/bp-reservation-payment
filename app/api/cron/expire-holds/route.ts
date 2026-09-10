// FR-12: 만료된 홀드를 자동 해제하는 배치 엔드포인트. Vercel Cron이 1분 주기로 호출한다(vercel.json 참고).
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
