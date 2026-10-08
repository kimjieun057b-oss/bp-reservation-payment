"use client";

// 05. 예약완료 단계: hold 생성 직후 결제 대기(HOLD) 화면을 보여주고, 결제가 확정(CONFIRMED)되면
// 같은 자리에서 완료 화면으로 전환한다. CheckoutPanel.tsx와 동일한 API(폴링/PortOne 결제/서버 재검증)를
// 재사용하되, 화면 구성은 와이어프레임의 완료 화면에 맞춰 새로 그린다.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Toast from "@/components/ui/Toast";
import { formatWon } from "@/lib/formatCurrency";
import type { ReservationDetail } from "./types";

export interface StepCompleteProps {
  reservationId: string;
}

const STATUS_LABEL: Record<ReservationDetail["status"], string> = {
  HOLD: "결제 대기 중",
  CONFIRMED: "예약 확정",
  CANCELLED: "예약 취소됨",
  EXPIRED: "결제 만료됨",
};

export default function StepComplete({ reservationId }: StepCompleteProps) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationDetail | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const fetchReservation = useCallback(async () => {
    const res = await fetch(`/api/reservations/${reservationId}`);
    const result = await res.json();
    if (!res.ok)
      throw new Error(result.message ?? "예약 정보를 불러오지 못했습니다.");

    const data = result.reservation as ReservationDetail;
    setReservation(data);
    setLoadError(null);
    return data;
  }, [reservationId]);

  // 최초 조회 + 5초마다 polling (홀드 만료/결제 확정 여부 반영).
  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      fetchReservation().catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "예약 정보를 불러오지 못했습니다.",
          );
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
      const intentRes = await fetch(
        `/api/reservations/${reservationId}/payment`,
        { method: "POST" },
      );
      const intent = await intentRes.json();
      if (!intentRes.ok)
        throw new Error(intent.message ?? "결제 준비에 실패했습니다.");

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
        throw new Error(
          response?.message ?? "결제가 취소되었거나 실패했습니다.",
        );
      }

      // 브라우저 응답은 위변조 가능하므로 서버가 PG API로 재검증한 뒤에만 예약을 확정한다.
      const completeRes = await fetch(
        `/api/reservations/${reservationId}/payment/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: response.paymentId }),
        },
      );
      const completeResult = await completeRes.json();
      if (!completeRes.ok)
        throw new Error(completeResult.message ?? "결제 확인에 실패했습니다.");

      fetchReservation().catch(() => {});
    } catch (err) {
      setPayError(
        err instanceof Error ? err.message : "결제 중 오류가 발생했습니다.",
      );
    } finally {
      setPaying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/hold`, {
        method: "DELETE",
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message ?? "취소에 실패했습니다.");
      setCancelMessage("예약 취소가 완료되었습니다.");
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "취소에 실패했습니다.",
      );
    } finally {
      setCancelling(false);
    }
  }

  const closeCancelToast = useCallback(() => {
    setCancelMessage(null);
    router.push(reservation ? `/rooms/${reservation.room_type_id}` : "/");
  }, [router, reservation]);

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>;
  }

  if (!reservation) {
    return <p className="text-sm text-muted">불러오는 중...</p>;
  }

  if (reservation.status === "CONFIRMED") {
    return (
      <div className="card p-10 text-center max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-full border-2 border-title flex items-center justify-center text-2xl mx-auto mb-5">
          ✓
        </div>
        <p className="text-xl font-bold text-title mb-2">
          예약이 완료되었습니다.
        </p>
        <p className="text-sm text-muted mb-8">
          예약 정보를 확인하시고 안전하게 보관해주세요.
        </p>

        <div className="card p-5 text-left mb-8">
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">예약번호</span>
              <span className="text-title font-medium">{reservation.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">객실</span>
              <span className="text-title font-medium">
                {reservation.room_types?.name}
                {reservation.rooms?.name ? ` (${reservation.rooms.name})` : ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">체크인</span>
              <span className="text-title font-medium">
                {reservation.check_in}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">체크아웃</span>
              <span className="text-title font-medium">
                {reservation.check_out}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">예약자</span>
              <span className="text-title font-medium">
                {reservation.guest_name}
              </span>
            </div>
            {reservation.reservation_addons.length > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted shrink-0">옵션</span>
                <span className="text-title font-medium text-right">
                  {reservation.reservation_addons
                    .map((a) => `${a.addons?.name ?? "옵션"} x${a.quantity}`)
                    .join(", ")}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-2.5 border-t border-gray-100">
              <span className="text-muted">결제금액</span>
              <span className="text-primary font-bold">
                {formatWon(reservation.total_price)}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted mb-6">
          예약 관련 안내는 입력하신 이메일로 발송됩니다.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/my-reservations")}
            className="btn-primary flex-1"
          >
            예약 내역 확인
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="btn-ghost flex-1"
          >
            홈으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card p-6 max-w-lg mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-lg font-bold text-title">05. 예약 완료</p>
          <span className="badge badge-info">
            {STATUS_LABEL[reservation.status]}
          </span>
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
                {reservation.guest_name} 외{" "}
                {Math.max(0, reservation.guest_count - 1)}인
              </span>
            </div>
          </div>

          <div className="flex justify-between items-baseline mb-5">
            <span className="text-sm text-white/60">결제 금액</span>
            <span className="text-xl font-bold text-primary">
              {formatWon(reservation.total_price)}
            </span>
          </div>

          {reservation.status === "HOLD" && (
            <>
              {cancelError && (
                <p className="text-sm text-red-400 mb-3">{cancelError}</p>
              )}

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

          {(reservation.status === "EXPIRED" ||
            reservation.status === "CANCELLED") && (
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
      <Toast vaild={payError} setVaild={setPayError} />
      <Toast vaild={cancelMessage} setVaild={closeCancelToast} />
    </>
  );
}
