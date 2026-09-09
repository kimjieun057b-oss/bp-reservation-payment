// FR-7 AC2/FR-8: 관리자 강제 취소 및 수동 환불 처리 (설계문서 4-2 "PATCH /admin/reservations/:id/cancel").
// refund_amount를 지정하면 환불 규정 대신 그 금액을 그대로 PG 환불에 사용한다(예외 처리 경로).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cancelReservation } from "@/lib/reservations";
import { paymentProvider } from "@/lib/payments";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    // middleware.ts는 /admin 페이지만 보호하므로, /api/admin 라우트는 여기서 동일한 세션 쿠키를 직접 확인한다.
    const cookieStore = await cookies();
    if (!cookieStore.get("admin_session")?.value) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    let reason: string | undefined;
    let refundAmount: number | undefined;
    try {
        const body = await request.json();
        reason = typeof body?.reason === "string" ? body.reason : undefined;
        refundAmount = typeof body?.refund_amount === "number" ? body.refund_amount : undefined;
    } catch {
        // 빈 body 허용 (정책대로 계산하는 기본 취소)
    }

    try {
        const result = await cancelReservation(id, paymentProvider, {
            reason: reason ?? "관리자 강제 취소",
            overrideRefundAmount: refundAmount,
        });

        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : result.error === "INVALID_OVERRIDE_AMOUNT" ? 400 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : result.error === "PAYMENT_NOT_FOUND"
                      ? "결제 내역을 찾을 수 없습니다."
                      : result.error === "INVALID_OVERRIDE_AMOUNT"
                        ? "환불 금액이 결제 금액 범위를 벗어났습니다."
                        : "취소할 수 없는 예약 상태입니다.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({
            ok: true,
            refundPercent: result.refundPercent,
            refundAmount: result.refundAmount,
        });
    } catch (err) {
        console.error("[PATCH /api/admin/reservations/:id/cancel]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
