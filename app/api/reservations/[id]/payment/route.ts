// FR-5: "결제하기" 클릭 시 PG 결제창을 띄우기 전 payments(READY) row를 먼저 발급한다.
import { NextResponse } from "next/server";
import { createPaymentIntent, type CreatePaymentIntentError } from "@/lib/reservations";

const STATUS_BY_ERROR: Record<CreatePaymentIntentError, number> = {
    NOT_FOUND: 404,
    NOT_HOLD: 409,
    HOLD_EXPIRED: 409,
};

const MESSAGE_BY_ERROR: Record<CreatePaymentIntentError, string> = {
    NOT_FOUND: "예약을 찾을 수 없습니다.",
    NOT_HOLD: "결제 대기 상태인 예약만 결제를 진행할 수 있습니다.",
    HOLD_EXPIRED: "결제 시간이 만료되어 결제를 진행할 수 없습니다. 다시 예약해주세요.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
        const result = await createPaymentIntent(id);

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error, message: MESSAGE_BY_ERROR[result.error] },
                { status: STATUS_BY_ERROR[result.error] }
            );
        }

        return NextResponse.json(
            {
                order_id: result.intent.orderId,
                amount: result.intent.amount,
                order_name: result.intent.orderName,
            },
            { status: 201 }
        );
    } catch (err) {
        console.error("[POST /api/reservations/:id/payment]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
