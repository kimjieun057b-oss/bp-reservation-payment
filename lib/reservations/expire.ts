import { supabaseAdmin } from "@/lib/supabaseAdmin";

// FR-2 / FR-12: hold_expire_at이 지난 HOLD 예약을 일괄 EXPIRED로 전환한다.
// 실제 1분 주기 실행(Cron)은 M6에서 이 함수를 호출하는 배치 엔드포인트로 연결한다.
export async function expireDueHolds(now: Date = new Date()): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("reservations")
        .update({ status: "EXPIRED", updated_at: now.toISOString() })
        .eq("status", "HOLD")
        .lt("hold_expire_at", now.toISOString())
        .select("id");

    if (error) {
        throw new Error(error.message);
    }

    return (data ?? []).map((row) => row.id as string);
}
