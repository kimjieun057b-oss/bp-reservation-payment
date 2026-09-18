"use client";

import { formatWon } from "@/lib/formatCurrency";
import type { RefundPolicyTier } from "@/lib/reservations/refund";

function formatRefundTier(tier: RefundPolicyTier): string {
    const when = tier.days_before === 0 ? "당일 취소" : `체크인 ${tier.days_before}일 전까지 취소`;
    return tier.refund_percent > 0 ? `${when}: ${tier.refund_percent}% 환불` : `${when}: 환불 불가`;
}

export interface GuestInfoSummary {
    roomTypeName: string | undefined;
    checkIn: string | null;
    checkOut: string | null;
    nights: number;
    roomTotal: number;
    addonsTotal: number;
}

export interface StepGuestInfoProps {
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    guestCount: number;
    capacityMax: number | undefined;
    onChangeName: (v: string) => void;
    onChangePhone: (v: string) => void;
    onChangeEmail: (v: string) => void;
    onChangeCount: (v: number) => void;
    summary: GuestInfoSummary;
    refundPolicies: RefundPolicyTier[];
    submitting: boolean;
    onBack: () => void;
    onSubmit: () => void;
}

export default function StepGuestInfo({
    guestName,
    guestPhone,
    guestEmail,
    guestCount,
    capacityMax,
    onChangeName,
    onChangePhone,
    onChangeEmail,
    onChangeCount,
    summary,
    refundPolicies,
    submitting,
    onBack,
    onSubmit,
}: StepGuestInfoProps) {
    const grandTotal = summary.roomTotal + summary.addonsTotal;

    return (
        <div className="flex flex-col pc:flex-row gap-6">
            <div className="card p-6 flex-1">
                <p className="text-lg font-bold text-title mb-1">04. 예약자 정보</p>
                <p className="text-sm text-muted mb-6">예약자 정보를 입력해주세요.</p>

                <div className="space-y-3">
                    <div>
                        <label className="form-label">예약자 이름</label>
                        <input
                            className="form-input"
                            value={guestName}
                            onChange={(e) => onChangeName(e.target.value)}
                            placeholder="홍길동"
                        />
                    </div>
                    <div>
                        <label className="form-label">연락처</label>
                        <input
                            className="form-input"
                            value={guestPhone}
                            onChange={(e) => onChangePhone(e.target.value)}
                            placeholder="010-0000-0000"
                        />
                    </div>
                    <div>
                        <label className="form-label">이메일 (선택)</label>
                        <input
                            type="email"
                            className="form-input"
                            value={guestEmail}
                            onChange={(e) => onChangeEmail(e.target.value)}
                            placeholder="예약 확정 메일을 받을 주소"
                        />
                    </div>
                    <div>
                        <label className="form-label">인원</label>
                        <input
                            type="number"
                            min={1}
                            max={capacityMax}
                            className="form-input"
                            value={guestCount}
                            onChange={(e) => onChangeCount(Number(e.target.value) || 1)}
                        />
                    </div>
                </div>

                <div className="flex justify-between mt-8">
                    <button type="button" onClick={onBack} className="btn-ghost px-8">
                        이전
                    </button>
                    <button type="button" onClick={onSubmit} disabled={submitting} className="btn-primary px-8">
                        {submitting ? "예약 처리 중..." : "예약 신청하기"}
                    </button>
                </div>
            </div>

            <div className="w-full pc:w-80 shrink-0 h-fit">
                <div className="bg-title rounded-lg p-5">
                    <p className="text-sm text-white/60 mb-3">예약 요약</p>
                    <div className="space-y-2 text-sm border-b border-white/10 pb-4 mb-4">
                        <div className="flex justify-between">
                            <span className="text-white/60">객실</span>
                            <span className="text-white">{summary.roomTypeName ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/60">체크인</span>
                            <span className="text-white">{summary.checkIn ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/60">체크아웃</span>
                            <span className="text-white">{summary.checkOut ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/60">숙박</span>
                            <span className="text-white">{summary.nights > 0 ? `${summary.nights}박` : "-"}</span>
                        </div>
                    </div>

                    <div className="space-y-1 text-sm mb-3">
                        <div className="flex justify-between">
                            <span className="text-white/60">객실 요금</span>
                            <span className="text-white">{formatWon(summary.roomTotal)}</span>
                        </div>
                        {summary.addonsTotal > 0 && (
                            <div className="flex justify-between">
                                <span className="text-white/60">옵션 요금</span>
                                <span className="text-white">{formatWon(summary.addonsTotal)}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-baseline">
                        <span className="text-sm text-white/60">합계</span>
                        <span className="text-xl font-bold text-primary">{formatWon(grandTotal)}</span>
                    </div>
                </div>

                {refundPolicies.length > 0 && (
                    <div className="card p-5 text-xs text-muted space-y-1 mt-4">
                        <p className="text-title font-medium mb-1">환불 규정</p>
                        {refundPolicies.map((tier) => (
                            <p key={tier.days_before}>{formatRefundTier(tier)}</p>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
