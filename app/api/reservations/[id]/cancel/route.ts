// FR-4/FR-7: 결제 완료된 예약의 고객 취소 요청. 환불 규정(refund_policies) 기준으로 환불액을 자동 계산해
// PG 환불까지 실제로 트리거한다(설계문서 4-1 "POST /reservations/:id/cancel").
import { NextResponse } from "next/server";
import { cancelReservation, previewRefund } from "@/lib/reservations";
import { paymentProvider } from "@/lib/payments";

// FR-4 AC2: 취소 확정 전, 환불 규정 기준 예상 환불액을 먼저 안내하기 위한 조회 전용 엔드포인트. 상태 변경 없음.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
        const result = await previewRefund(id);

        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : 409;
            const message =
                result.error === "NOT_FOUND" ? "예약을 찾을 수 없습니다." : "취소할 수 없는 예약 상태입니다.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({
            refundPercent: result.refundPercent,
            refundAmount: result.refundAmount,
            totalPrice: result.totalPrice,
        });
    } catch (err) {
        console.error("[GET /api/reservations/:id/cancel]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    let reason: string | undefined;
    try {
        const body = await request.json();
        reason = typeof body?.reason === "string" ? body.reason : undefined;
    } catch {
        // 빈 body 허용 (취소 사유는 선택 입력)
    }

    try {
        const result = await cancelReservation(id, paymentProvider, { reason });

        if (!result.ok) {
            const status = result.error === "NOT_FOUND" ? 404 : 409;
            const message =
                result.error === "NOT_FOUND"
                    ? "예약을 찾을 수 없습니다."
                    : result.error === "PAYMENT_NOT_FOUND"
                      ? "결제 내역을 찾을 수 없습니다."
                      : "취소할 수 없는 예약 상태입니다.";
            return NextResponse.json({ error: result.error, message }, { status });
        }

        return NextResponse.json({
            ok: true,
            refundPercent: result.refundPercent,
            refundAmount: result.refundAmount,
        });
    } catch (err) {
        console.error("[POST /api/reservations/:id/cancel]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
