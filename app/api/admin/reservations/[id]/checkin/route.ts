// 프런트 데스크 체크인 처리: PATCH로 처리(checked_in_at=now), DELETE로 취소(되돌리기).
// 검증 로직은 lib/reservations/checkinout.ts에서 체크아웃과 함께 관리한다
// (되돌리기가 서로의 상태에 의존하므로, 파일이 갈리면서 한쪽만 수정되는 일을 막기 위함).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkIn, undoCheckIn } from "@/lib/reservations/checkinout";

type Params = { params: Promise<{ id: string }> };

async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function PATCH(_request: Request, { params }: Params) {
    const user = await requireAdmin();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    try {
        const result = await checkIn(id);
        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : "결제 완료된 예약만 체크인할 수 있습니다.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({ ok: true, checked_in_at: result.checkedInAt });
    } catch (err) {
        console.error("[PATCH /api/admin/reservations/:id/checkin]", err);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크인 처리에 실패했습니다." }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: Params) {
    const user = await requireAdmin();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    try {
        const result = await undoCheckIn(id);
        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : "이미 체크아웃 처리된 예약입니다. 체크아웃을 먼저 취소해 주세요.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/admin/reservations/:id/checkin]", err);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "체크인 취소에 실패했습니다." }, { status: 500 });
    }
}
