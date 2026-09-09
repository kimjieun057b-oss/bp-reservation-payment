// FR-6: PG(PortOne) 결제 웹훅 수신. 서명 검증 후 결제를 재확인해 예약을 확정한다.
// order_id(UNIQUE)로 조회하는 completePayment가 멱등하므로, 동일 웹훅이 중복 수신되어도
// 예약이 중복 확정되지 않는다. 클라이언트 sync 경로(/payment/complete)와 완전히 같은 로직을 공유한다.
import { NextResponse } from "next/server";
import { completePayment } from "@/lib/reservations";
import { paymentProvider } from "@/lib/payments";

// 예약 확정으로 이어지는 이벤트만 처리하고, 나머지 타입(가상계좌 발급, 결제 대기 등)은 200으로 승인만 한다.
const PAID_WEBHOOK_TYPES = new Set(["Transaction.Paid"]);

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
    const { provider } = await params;

    if (provider !== "portone") {
        return NextResponse.json({ error: "UNSUPPORTED_PROVIDER" }, { status: 404 });
    }

    const rawBody = await request.text();
    const headers = {
        "webhook-id": request.headers.get("webhook-id") ?? "",
        "webhook-signature": request.headers.get("webhook-signature") ?? "",
        "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    };

    const webhook = await paymentProvider.verifyWebhook(rawBody, headers);

    if (!webhook.valid) {
        console.warn("[POST /api/payments/webhook/portone] 서명 검증 실패");
        return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
    }

    if (!PAID_WEBHOOK_TYPES.has(webhook.type) || !webhook.orderId) {
        return NextResponse.json({ ok: true, ignored: true });
    }

    try {
        const result = await completePayment(webhook.orderId, paymentProvider);

        if (!result.ok) {
            if (result.error === "HOLD_EXPIRED_REFUNDED") {
                // FR-6 AC2: 홀드 만료 후 결제가 완료된 예외 케이스 - completePayment가 이미 자동 환불까지 처리했다.
                console.info("[POST /api/payments/webhook/portone] 홀드 만료 후 결제 완료 - 자동 환불 처리됨");
            } else {
                // 예: 아직 PG 쪽 상태가 PAID로 안 잡히는 짧은 지연 등 - 재시도해도 되는 상황이므로 승인만 하고 넘어간다.
                console.warn("[POST /api/payments/webhook/portone] completePayment 실패", result.error);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[POST /api/payments/webhook/portone]", err);
        // 5xx로 응답해 PG의 웹훅 재시도를 유도한다.
        return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
    }
}
