// PRD FR-11: 알림 채널(문자/카카오알림톡 등)을 벤더 교체 가능하게 만드는 인터페이스.
// 발송 성공/실패 이력은 notification_logs 테이블에 기록한다 (AC 참고).

export interface NotificationMessage {
    to: string;
    templateId: string;
    variables: Record<string, string>;
}

export interface NotificationChannel {
    send(message: NotificationMessage): Promise<void>;
}
