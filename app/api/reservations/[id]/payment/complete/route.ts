// FR-6: 브라우저 SDK의 결제 성공 응답은 클라이언트에서 위변조될 수 있으므로,
// paymentId(order_id)를 서버로 보내 PG API로 재검증한 뒤에만 예약을 확정한다.
// (PG 웹훅이 도착하기 전에도 결제 직후 즉시 확정 화면을 보여주기 위한 경로 — 웹훅과 동일 로직을 공유하며 멱등하다.)
import { NextResponse } from "next/server";
import { completePayment, type CompletePaymentError } from "@/lib/reservations";
import { paymentProvider } from "@/lib/payments";

const STATUS_BY_ERROR: Record<CompletePaymentError, number> = {
    PAYMENT_NOT_FOUND: 404,
    RESERVATION_MISMATCH: 400,
    NOT_PAID: 409,
    RESERVATION_NOT_FOUND: 404,
    HOLD_EXPIRED_REFUNDED: 409,
};

const MESSAGE_BY_ERROR: Record<CompletePaymentError, string> = {
    PAYMENT_NOT_FOUND: "결제 정보를 찾을 수 없습니다.",
    RESERVATION_MISMATCH: "이 예약의 결제 건이 아닙니다.",
    NOT_PAID: "아직 결제가 완료되지 않았습니다.",
    RESERVATION_NOT_FOUND: "예약을 찾을 수 없습니다.",
    HOLD_EXPIRED_REFUNDED: "결제 처리 중 예약이 만료되어 자동으로 환불되었습니다.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문을 확인해주세요." }, { status: 400 });
    }

    const orderId = body.order_id ?? body.payment_id;
    if (!orderId || typeof orderId !== "string") {
        return NextResponse.json(
            { error: "MISSING_FIELDS", message: "order_id가 필요합니다." },
            { status: 400 }
        );
    }

    try {
        const result = await completePayment(orderId, paymentProvider, id);

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error, message: MESSAGE_BY_ERROR[result.error] },
                { status: STATUS_BY_ERROR[result.error] }
            );
        }

        return NextResponse.json({ ok: true, already_confirmed: result.alreadyConfirmed });
    } catch (err) {
        console.error("[POST /api/reservations/:id/payment/complete]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "결제 확인 중 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
