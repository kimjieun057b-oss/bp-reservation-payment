// 전화 예약(계좌이체 확인 후) 수동 확정: PATCH로 HOLD -> CONFIRMED 처리한다.
// checkin/route.ts와 동일한 인증/에러 응답 구조.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmPhoneBooking } from "@/lib/reservations/phoneBooking";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    try {
        const result = await confirmPhoneBooking(id);
        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : "전화 예약 중 결제대기 상태인 건만 확정할 수 있습니다.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[PATCH /api/admin/reservations/:id/confirm]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "확정 처리에 실패했습니다." },
            { status: 500 }
        );
    }
}
