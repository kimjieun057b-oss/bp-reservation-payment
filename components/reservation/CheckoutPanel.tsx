"use client";

// 결제 대기 화면: 예약 요약 + PortOne 결제창 호출 + 홀드 취소.
// 설계문서 3장(예약 상태 흐름도)의 "PG 결제창 진입" 단계. 결제 자체는 브라우저 SDK가 처리하고,
// 서버는 그 결과를 재검증(/payment/complete)하거나 PG 웹훅으로 예약을 확정한다(FR-6).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/ui/Toast";

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
    EXPIRED: "결제 만료됨",
};

export default function CheckoutPanel({ reservationId }: CheckoutPanelProps) {
    const router = useRouter();
    const [reservation, setReservation] = useState<ReservationDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const [completeMessage, setCompleteMessage] = useState<string | null>(null);
    const notifiedConfirmRef = useRef(false);

    // 예약 상태 조회 + 반영을 한 곳에 모아, polling과 결제 완료 직후 즉시 갱신 양쪽에서 재사용한다.
    const fetchReservation = useCallback(async () => {
        const res = await fetch(`/api/reservations/${reservationId}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.message ?? "예약 정보를 불러오지 못했습니다.");

        const data = result.reservation as ReservationDetail;
        setReservation(data);
        setLoadError(null);

        if (data.status === "CONFIRMED" && !notifiedConfirmRef.current) {
            notifiedConfirmRef.current = true;
            setCompleteMessage("예약이 완료되었습니다.");
        }

        return data;
    }, [reservationId]);

    // 최초 조회 + 5초마다 polling (설계문서 4-1: 홀드 만료/결제 확정 여부를 polling으로 반영).
    useEffect(() => {
        let cancelled = false;

        const poll = () => {
            fetchReservation().catch((err) => {
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
    }, [fetchReservation]);

    async function handlePay() {
        if (!reservation) return;

        setPaying(true);
        setPayError(null);
        try {
            const intentRes = await fetch(`/api/reservations/${reservationId}/payment`, { method: "POST" });
            const intent = await intentRes.json();
            if (!intentRes.ok) throw new Error(intent.message ?? "결제 준비에 실패했습니다.");

            const PortOne = await import("@portone/browser-sdk/v2");
            const response = await PortOne.requestPayment({
                storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID as string,
                channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY as string,
                paymentId: intent.order_id,
                orderName: intent.order_name,
                totalAmount: intent.amount,
                currency: "CURRENCY_KRW",
                payMethod: "CARD",
                customer: { fullName: reservation.guest_name },
                redirectUrl: window.location.href,
            });

            if (!response || response.code !== undefined) {
                throw new Error(response?.message ?? "결제가 취소되었거나 실패했습니다.");
            }

            // 브라우저 응답은 위변조 가능하므로 서버가 PG API로 재검증한 뒤에만 예약을 확정한다(FR-6).
            const completeRes = await fetch(`/api/reservations/${reservationId}/payment/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: response.paymentId }),
            });
            const completeResult = await completeRes.json();
            if (!completeRes.ok) throw new Error(completeResult.message ?? "결제 확인에 실패했습니다.");

            // 서버는 이미 확정 처리를 마쳤으므로, 다음 polling(최대 5초)을 기다리지 않고 즉시 화면에 반영한다.
            fetchReservation().catch(() => {});
        } catch (err) {
            setPayError(err instanceof Error ? err.message : "결제 중 오류가 발생했습니다.");
        } finally {
            setPaying(false);
        }
    }

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

    const closeCompleteToast = useCallback(() => {
        setCompleteMessage(null);
        router.push("/my-reservations");
    }, [router]);

    if (loadError) {
        return <p className="text-sm text-red-600">{loadError}</p>;
    }

    if (!reservation) {
        return <p className="text-sm text-muted">불러오는 중...</p>;
    }

    return (
        <>
            <section>
                <div>
                    <div className="mb-10 flex items-center justify-between">
                        <p className="page-title">예약 확인</p>
                        <span className="badge badge-info">{STATUS_LABEL[reservation.status]}</span>
                    </div>

                    <div className="bg-title rounded-lg p-5">
                        {reservation.status === "HOLD" && (
                            <p className="text-xs text-white/60 text-center pb-4 mb-4 border-b border-white/10">
                                예약 결제는 24시간 이내에 완료하지 않으면 자동으로 취소됩니다.
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

                                <button
                                    type="button"
                                    onClick={handlePay}
                                    disabled={paying || cancelling}
                                    className="btn-primary w-full mb-2"
                                >
                                    {paying ? "결제 처리 중..." : "결제하기"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    disabled={cancelling || paying}
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
            </section>
            <Toast vaild={completeMessage} setVaild={closeCompleteToast} />
            <Toast vaild={payError} setVaild={setPayError} />
        </>
    );
}
