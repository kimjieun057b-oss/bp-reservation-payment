// FR-2: 결제 전 홀드를 고객이 직접 해제 (설계문서 4-1 "DELETE /reservations/:id/hold")
import { NextResponse } from "next/server";
import { releaseHold } from "@/lib/reservations";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
        const result = await releaseHold(id);

        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : "이미 확정되었거나 취소/만료된 예약은 해제할 수 없습니다.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/reservations/:id/hold]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
