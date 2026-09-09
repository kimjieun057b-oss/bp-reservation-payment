// PRD FR-5: PG사에 종속되지 않는 결제 연동 인터페이스.
// 신규 PG사를 추가할 때는 이 인터페이스의 구현체만 추가하면 되고,
// 예약 도메인 로직(lib/reservations)은 이 인터페이스로만 결제와 통신해야 한다.
//
// DEC-005 참고: PortOne V2는 결제 요청 자체를 서버가 아닌 브라우저 SDK가 직접 처리하므로
// (서버가 만드는 건 order_id뿐), 이 인터페이스는 "서버가 실제로 해야 하는 일"인
// 결제 결과 검증 / 웹훅 검증 / 환불로 구성한다.

export interface PaymentVerifyResult {
    orderId: string;
    status: string;
    amount: number;
    pgTransactionId?: string;
    method?: string;
    raw: unknown;
}

export interface WebhookVerifyResult {
    valid: boolean;
    type: string;
    orderId: string | null;
}

export interface RefundRequest {
    orderId: string;
    amount?: number;
    reason: string;
}

export interface PaymentProvider {
    // 결제 시도 ID(order_id)로 PG 서버에 실제 결제 결과를 조회한다.
    // 브라우저에서 받은 성공 응답은 위변조 가능하므로, 반드시 이 결과로 금액/상태를 재검증해야 한다(FR-6).
    // verifyPayment : PG사에게 진짜 결제가 성공했는지 확인
    // verifyWebhook : PG사가 보낸 웹훅인 진짜 PG사가 보낸게 맞는지 서명 확인
    // refund : 환불 요청
    verifyPayment(orderId: string): Promise<PaymentVerifyResult>;
    verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerifyResult>;
    refund(req: RefundRequest): Promise<void>;
}
