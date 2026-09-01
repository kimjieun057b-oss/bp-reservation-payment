// PRD FR-5: PG사에 종속되지 않는 결제 연동 인터페이스.
// 신규 PG사를 추가할 때는 이 인터페이스의 구현체만 추가하면 되고,
// 예약 도메인 로직(lib/reservations)은 이 인터페이스로만 결제와 통신해야 한다.

export interface PaymentRequest {
    orderId: string;
    amount: number;
    orderName: string;
}

export interface PaymentRequestResult {
    paymentKey: string;
    redirectUrl?: string;
}

export interface WebhookVerifyResult {
    valid: boolean;
    orderId: string;
    paymentKey: string;
    amount: number;
}

export interface RefundRequest {
    paymentKey: string;
    amount: number;
    reason: string;
}

export interface PaymentProvider {
    requestPayment(req: PaymentRequest): Promise<PaymentRequestResult>;
    verifyWebhook(rawBody: string, signature: string): Promise<WebhookVerifyResult>;
    refund(req: RefundRequest): Promise<void>;
}
