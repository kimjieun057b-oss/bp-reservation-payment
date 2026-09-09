// PortOne(포트원) V2 경유 토스페이먼츠 연동 구현체 (DEC-004 PG사 표준화 참고).
// PortOne V2는 결제 요청 자체는 브라우저 SDK(@portone/browser-sdk)가 직접 처리하므로,
// 서버 구현체는 "결제 결과 조회/검증"과 "웹훅 검증", "환불"만 담당한다.
import { PaymentClient, Webhook } from "@portone/server-sdk";
import type { PaymentProvider, PaymentVerifyResult, WebhookVerifyResult, RefundRequest } from "./PaymentProvider";

const secret = process.env.PORTONE_SECRET;
const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
const webhookSecret = process.env.PORTONE_WEBHOOK_SECRET;

if (!secret) {
    throw new Error("Missing PORTONE_SECRET");
}
if (!storeId) {
    throw new Error("Missing NEXT_PUBLIC_PORTONE_STORE_ID");
}

const client = PaymentClient({ secret, storeId });

export const portoneProvider: PaymentProvider = {
    async verifyPayment(orderId) {
        const payment = await client.getPayment({ paymentId: orderId });

        // status는 향후 PortOne이 새 값을 추가할 경우 SDK가 symbol(Unrecognized)로 내려줄 수 있어 문자열로 방어한다.
        const status = typeof payment.status === "string" ? payment.status : "UNRECOGNIZED";
        const amount = payment.status === "PAID" || payment.status === "PARTIAL_CANCELLED" ? payment.amount.total : 0;
        const pgTransactionId = "pgTxId" in payment ? payment.pgTxId : undefined;
        const method = "method" in payment ? (payment.method as { type?: string } | undefined)?.type : undefined;

        return {
            orderId,
            status,
            amount,
            pgTransactionId,
            method,
            raw: payment,
        } satisfies PaymentVerifyResult;
    },

    async verifyWebhook(rawBody, headers) {
        if (!webhookSecret) {
            throw new Error("Missing PORTONE_WEBHOOK_SECRET");
        }

        try {
            const webhook = await Webhook.verify(webhookSecret, rawBody, headers);
            // type도 status와 마찬가지로 알 수 없는 신규 이벤트인 경우 symbol(Unrecognized)일 수 있다.
            const type = typeof webhook.type === "string" ? webhook.type : "Unrecognized";
            const orderId =
                "data" in webhook && webhook.data && "paymentId" in webhook.data
                    ? (webhook.data.paymentId as string)
                    : null;

            return { valid: true, type, orderId } satisfies WebhookVerifyResult;
        } catch {
            // 서명이 유효하지 않거나 헤더가 누락된 경우.
            return { valid: false, type: "", orderId: null } satisfies WebhookVerifyResult;
        }
    },

    async refund({ orderId, amount, reason }: RefundRequest) {
        await client.cancelPayment({ paymentId: orderId, amount, reason });
    },
};
