// FR-2: 결제 전 홀드를 고객이 직접 해제 (설계문서 4-1 "DELETE /reservations/:id/hold")
// 결제 전(HOLD) 상태는 돈이 오가지 않으므로 예약자명/전화번호 확인을 강제하지 않는다(DEC-006).
// /checkout/:reservationId 페이지는 예약 생성 직후 같은 세션에서 바로 접근하는 흐름이라 재입력 UI가 없어,
// body 없이 호출해도 그대로 해제되도록 둔다. 예약 조회 화면 등에서 guest_name/guest_phone을 함께 보내면
// 소유자 일치 여부는 그래도 검증한다.
import { NextResponse } from "next/server";
import { releaseHold } from "@/lib/reservations";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    let guestName: string | undefined;
    let guestPhone: string | undefined;
    try {
        const body = await request.json();
        guestName = typeof body?.guest_name === "string" ? body.guest_name : undefined;
        guestPhone = typeof body?.guest_phone === "string" ? body.guest_phone : undefined;
    } catch {
        // 빈 body 허용
    }

    const guest = guestName?.trim() && guestPhone?.trim() ? { name: guestName, phone: guestPhone } : undefined;

    try {
        const result = await releaseHold(id, guest);

        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : result.error === "GUEST_MISMATCH" ? 403 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : result.error === "GUEST_MISMATCH"
                      ? "예약자 정보가 일치하지 않습니다."
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
