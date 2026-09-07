"use client";

// 결제 대기 화면: hold_expire_at 카운트다운 + 예약 요약 + 홀드 취소.
// 설계문서 3장(예약 상태 흐름도)의 "PG 결제창 진입" 단계 — 실제 PG 연동(PaymentProvider 구현체)은
// M3에서 붙는다. 그 전까지는 홀드 조회/취소만 동작하는 대기 화면으로 둔다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface CheckoutPanelProps {
    reservationId: string;
}

interface ReservationDetail {
    id: string;
    status: "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
    check_in: string;
    check_out: string;
    guest_name: string;
    guest_count: number;
    total_price: number;
    hold_expire_at: string | null;
    refund_amount: number | null;
    room_type_id: string;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
}

const STATUS_LABEL: Record<ReservationDetail["status"], string> = {
    HOLD: "결제 대기 중",
    CONFIRMED: "예약 확정",
    CANCELLED: "예약 취소됨",
    EXPIRED: "홀드 만료됨",
};

function formatRemaining(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function CheckoutPanel({ reservationId }: CheckoutPanelProps) {
    const router = useRouter();
    const [reservation, setReservation] = useState<ReservationDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    // 최초 조회 + 5초마다 polling (설계문서 4-1: 홀드 만료/결제 확정 여부를 polling으로 반영).
    // fetch(...).then(...) 체인을 effect 안에 직접 써서, setState는 항상 비동기 콜백 안에서만 호출되게 한다.
    useEffect(() => {
        let cancelled = false;

        const poll = () => {
            fetch(`/api/reservations/${reservationId}`)
                .then(async (res) => {
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.message ?? "예약 정보를 불러오지 못했습니다.");
                    return result.reservation as ReservationDetail;
                })
                .then((data) => {
                    if (cancelled) return;
                    setReservation(data);
                    setLoadError(null);
                })
                .catch((err) => {
                    if (!cancelled) {
                        setLoadError(err instanceof Error ? err.message : "예약 정보를 불러오지 못했습니다.");
                    }
                });
        };

        const pollId = setInterval(poll, 5000);
        poll();

        return () => {
            cancelled = true;
            clearInterval(pollId);
        };
    }, [reservationId]);

    // 1초마다 카운트다운 갱신
    useEffect(() => {
        const tickId = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tickId);
    }, []);

    async function handleCancel() {
        setCancelling(true);
        setCancelError(null);
        try {
            const res = await fetch(`/api/reservations/${reservationId}/hold`, { method: "DELETE" });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message ?? "취소에 실패했습니다.");
            router.push(reservation ? `/rooms/${reservation.room_type_id}` : "/");
        } catch (err) {
            setCancelError(err instanceof Error ? err.message : "취소에 실패했습니다.");
        } finally {
            setCancelling(false);
        }
    }

    if (loadError) {
        return <p className="text-sm text-red-600">{loadError}</p>;
    }

    if (!reservation || now === null) {
        return <p className="text-sm text-muted">불러오는 중...</p>;
    }

    const holdExpireAt = reservation.hold_expire_at ? new Date(reservation.hold_expire_at).getTime() : null;
    const remainingMs = holdExpireAt ? holdExpireAt - now : null;
    const isHoldActive = reservation.status === "HOLD" && remainingMs !== null && remainingMs > 0;

    return (
        <div className="max-w-md mx-auto space-y-4">
            <div className="card p-5 flex items-center justify-between">
                <p className="page-title">예약 확인</p>
                <span className="badge badge-info">{STATUS_LABEL[reservation.status]}</span>
            </div>

            <div className="bg-title rounded-lg p-5">
                {isHoldActive && (
                    <div className="text-center pb-4 mb-4 border-b border-white/10">
                        <p className="text-xs text-white/60 mb-1">홀드 만료까지 남은 시간</p>
                        <p className="text-2xl font-bold text-primary">{formatRemaining(remainingMs)}</p>
                    </div>
                )}

                {reservation.status === "HOLD" && remainingMs !== null && remainingMs <= 0 && (
                    <p className="text-sm text-red-400 mb-4">
                        홀드 시간이 지났습니다. 곧 자동으로 해제되며, 다시 예약해주셔야 합니다.
                    </p>
                )}

                <div className="space-y-2 text-sm border-b border-white/10 pb-4 mb-4">
                    <div className="flex justify-between">
                        <span className="text-white/60">객실</span>
                        <span className="text-white">
                            {reservation.room_types?.name}
                            {reservation.rooms?.name ? ` (${reservation.rooms.name})` : ""}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-white/60">체크인</span>
                        <span className="text-white">{reservation.check_in}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-white/60">체크아웃</span>
                        <span className="text-white">{reservation.check_out}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-white/60">예약자</span>
                        <span className="text-white">
                            {reservation.guest_name} 외 {Math.max(0, reservation.guest_count - 1)}인
                        </span>
                    </div>
                </div>

                <div className="flex justify-between items-baseline mb-5">
                    <span className="text-sm text-white/60">결제 금액</span>
                    <span className="text-xl font-bold text-primary">
                        {reservation.total_price.toLocaleString()}원
                    </span>
                </div>

                {reservation.status === "HOLD" && (
                    <>
                        {cancelError && <p className="text-sm text-red-400 mb-3">{cancelError}</p>}

                        {/* TODO(M3): lib/payments의 PaymentProvider 구현체 연동 후 실제 결제창 호출로 교체 */}
                        <button type="button" disabled className="btn-primary w-full mb-2">
                            결제하기 (PG 연동 준비 중)
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={cancelling}
                            className="w-full text-sm text-white/60 hover:text-white transition-colors py-2 cursor-pointer disabled:opacity-50"
                        >
                            {cancelling ? "취소 처리 중..." : "예약 취소하고 돌아가기"}
                        </button>
                    </>
                )}

                {reservation.status === "CONFIRMED" && (
                    <p className="text-sm text-white/80 text-center">
                        결제가 완료되어 예약이 확정되었습니다. 확정 안내 메일을 확인해주세요.
                    </p>
                )}

                {(reservation.status === "EXPIRED" || reservation.status === "CANCELLED") && (
                    <button
                        type="button"
                        onClick={() => router.push(`/rooms/${reservation.room_type_id}`)}
                        className="btn-primary w-full"
                    >
                        객실 다시 선택하기
                    </button>
                )}
            </div>
        </div>
    );
}
