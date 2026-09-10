"use client";

// 예약 캘린더 UI (날짜/인원 선택 + 요금 표시 + 고객정보 입력 + "예약 신청하기").
// rooms/[id]의 "실시간예약하기" -> reserve/[roomTypeId](객실이 이미 정해진 딥링크)와
// reserve(객실 미지정 - 인라인으로 선택) 양쪽에서 재사용한다.
// roomTypeId prop을 주면 곧바로 그 객실의 캘린더를, 안 주면 객실 선택기부터 보여준다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enumerateNights, toISODate } from "@/lib/reservations/pricing";
import type { RefundPolicyTier } from "@/lib/reservations/refund";
import Toast from "@/components/ui/Toast";

export interface BookingCalendarProps {
    roomTypeId?: string;
}

interface DayInfo {
    date: string;
    available: boolean;
    isPeak: boolean;
    isWeekend: boolean;
    price: number;
}

interface RoomTypeInfo {
    id: string;
    name: string;
    base_price: number;
    capacity_standard: number;
    capacity_max: number;
}

interface AvailabilityResponse {
    room_type: RoomTypeInfo;
    total_rooms: number;
    days: DayInfo[];
    refund_policies: RefundPolicyTier[];
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function monthKeyOf(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, "0")}`;
}

// FR-4 AC2: 예약 신청 전에 환불 규정을 미리 보여주기 위한 안내 문구 생성.
function formatRefundTier(tier: RefundPolicyTier): string {
    const when = tier.days_before === 0 ? "당일 취소" : `체크인 ${tier.days_before}일 전까지 취소`;
    return tier.refund_percent > 0 ? `${when}: ${tier.refund_percent}% 환불` : `${when}: 환불 불가`;
}

export default function BookingCalendar({ roomTypeId }: BookingCalendarProps) {
    const router = useRouter();
    const today = useMemo(() => new Date(), []);
    const todayISO = toISODate(today);

    // roomTypeId prop이 있으면(딥링크) 고정, 없으면 아래 선택기에서 고른 값을 담는다.
    const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string | null>(roomTypeId ?? null);

    const [pickerRoomTypes, setPickerRoomTypes] = useState<RoomTypeInfo[] | null>(null);
    const [pickerError, setPickerError] = useState<string | null>(null);

    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth() + 1); // 1~12

    const [roomType, setRoomType] = useState<RoomTypeInfo | null>(null);
    const [refundPolicies, setRefundPolicies] = useState<RefundPolicyTier[]>([]);
    const [monthsCache, setMonthsCache] = useState<Record<string, DayInfo[]>>({});
    const [loadError, setLoadError] = useState<string | null>(null);

    const [checkIn, setCheckIn] = useState<string | null>(null);
    const [checkOut, setCheckOut] = useState<string | null>(null);

    const [guestName, setGuestName] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [guestCount, setGuestCount] = useState(1);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // 드롭다운 바깥을 클릭하면 닫는다.
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 객실 선택/재선택은 여기 한 곳에서만 처리한다 (이전 객실의 달력 캐시가 새 객실에 섞이지 않도록 초기화).
    function selectRoomType(id: string | null) {
        setSelectedRoomTypeId(id);
        setMonthsCache({});
        setRoomType(null);
        setRefundPolicies([]);
        setCheckIn(null);
        setCheckOut(null);
        setLoadError(null);
    }

    // roomTypeId prop 없이 쓰일 때(=/reserve 인라인 선택)만 객실 목록을 불러온다.
    useEffect(() => {
        if (roomTypeId || selectedRoomTypeId || pickerRoomTypes) return;

        let cancelled = false;

        fetch("/api/room-types")
            .then(async (res) => {
                const result = await res.json();
                if (!res.ok) throw new Error(result.message ?? "객실 목록을 불러오지 못했습니다.");
                return result.room_types as RoomTypeInfo[];
            })
            .then((list) => {
                if (cancelled) return;
                setPickerRoomTypes(list);
                // 객실은 자동 선택하지 않는다 - 사용자가 드롭다운에서 직접 골라야 한다.
            })
            .catch((err) => {
                if (!cancelled) setPickerError(err instanceof Error ? err.message : "객실 목록을 불러오지 못했습니다.");
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomTypeId, selectedRoomTypeId]);

    const currentKey = monthKeyOf(viewYear, viewMonth);
    const currentDays = monthsCache[currentKey];
    const needsRoomTypeSelection = !roomTypeId && !selectedRoomTypeId;
    const loading = !!selectedRoomTypeId && !currentDays && !loadError;

    useEffect(() => {
        if (!selectedRoomTypeId || monthsCache[currentKey]) return;

        let cancelled = false;

        fetch(`/api/room-types/${selectedRoomTypeId}/availability?year=${viewYear}&month=${viewMonth}`)
            .then(async (res) => {
                const result = await res.json();
                if (!res.ok) throw new Error(result.message ?? "예약 가능 정보를 불러오지 못했습니다.");
                return result as AvailabilityResponse;
            })
            .then((result) => {
                if (cancelled) return;
                setLoadError(null);
                setRoomType(result.room_type);
                setRefundPolicies(result.refund_policies);
                setMonthsCache((prev) => ({ ...prev, [currentKey]: result.days }));
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err.message);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRoomTypeId, viewYear, viewMonth]);

    const goPrevMonth = useCallback(() => {
        setViewMonth((m) => {
            if (m === 1) {
                setViewYear((y) => y - 1);
                return 12;
            }
            return m - 1;
        });
    }, []);

    const goNextMonth = useCallback(() => {
        setViewMonth((m) => {
            if (m === 12) {
                setViewYear((y) => y + 1);
                return 1;
            }
            return m + 1;
        });
    }, []);

    const handleDateClick = useCallback(
        (day: DayInfo) => {
            if (!day.available || day.date < todayISO) return;

            if (!checkIn || checkOut) {
                setCheckIn(day.date);
                setCheckOut(null);
                return;
            }

            if (day.date > checkIn) {
                setCheckOut(day.date);
            } else {
                setCheckIn(day.date);
                setCheckOut(null);
            }
        },
        [checkIn, checkOut, todayISO]
    );

    // 요금표(주말/성수기)는 현재 보고 있는 달에 해당 요일/기간이 실제로 있을 때만 예시 가격으로 보여준다.
    const weekendSample = currentDays?.find((d) => d.isWeekend && !d.isPeak);
    const peakSample = currentDays?.find((d) => d.isPeak);

    const nights = checkIn && checkOut ? enumerateNights(checkIn, checkOut) : [];

    const totalPrice = nights.reduce((sum, nightDate) => {
        const iso = toISODate(nightDate);
        const info = monthsCache[iso.slice(0, 7)]?.find((d) => d.date === iso);
        return sum + (info?.price ?? 0);
    }, 0);

    async function handleSubmit() {
        setSubmitError(null);

        if (!selectedRoomTypeId) return;

        if (!checkIn || !checkOut) {
            setSubmitError("체크인/체크아웃 날짜를 선택해주세요.");
            return;
        }
        if (!guestName.trim() || !guestPhone.trim()) {
            setSubmitError("예약자 이름과 연락처를 입력해주세요.");
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/reservations/hold", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    room_type_id: selectedRoomTypeId,
                    check_in: checkIn,
                    check_out: checkOut,
                    guest_name: guestName,
                    guest_phone: guestPhone,
                    guest_email: guestEmail || undefined,
                    guest_count: guestCount,
                }),
            });
            const result = await res.json();

            if (!res.ok) {
                setSubmitError(result.message ?? "예약에 실패했습니다.");
                return;
            }

            router.push(`/checkout/${result.reservation_id}`);
        } catch {
            setSubmitError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSubmitting(false);
        }
    }

    // 달력 그리드: 이번 달 1일의 요일만큼 빈 칸을 채우고, 말일까지 채운다.
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => i);
    const dateCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
        <>
        <div className="flex flex-col pc:flex-row gap-6">
            <div className="card p-6 flex-1">
                {roomType && (
                    <p className="text-sm text-muted mb-4">
                        날짜 선택 · <span className="text-title font-medium">{roomType.name}</span>
                    </p>
                )}

                <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={goPrevMonth} className="btn-ghost px-3 py-1.5" aria-label="이전 달">
                        ‹
                    </button>
                    <p className="text-lg font-bold text-title">
                        {viewYear}년 {viewMonth}월
                    </p>
                    <button type="button" onClick={goNextMonth} className="btn-ghost px-3 py-1.5" aria-label="다음 달">
                        ›
                    </button>
                </div>

                {loadError && <p className="text-sm text-red-600 mb-3">{loadError}</p>}

                <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted mb-2">
                    {WEEKDAY_LABELS.map((label, i) => (
                        <div key={label} className={i === 0 ? "text-red-500" : i === 6 ? "text-primary" : undefined}>
                            {label}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {leadingBlanks.map((i) => (
                        <div key={`blank-${i}`} />
                    ))}

                    {dateCells.map((date) => {
                        const iso = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
                        const day = currentDays?.find((d) => d.date === iso);
                        const isPast = iso < todayISO;
                        const isSelectedStart = iso === checkIn;
                        const isSelectedEnd = iso === checkOut;
                        const isInRange = !!checkIn && !!checkOut && iso > checkIn && iso < checkOut;
                        const disabled = isPast || !day || !day.available;

                        return (
                            <button
                                key={iso}
                                type="button"
                                disabled={disabled}
                                onClick={() => day && handleDateClick(day)}
                                className={`relative aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors
                                    ${disabled ? "text-muted/50 cursor-not-allowed" : "cursor-pointer hover:bg-surface"}
                                    ${isSelectedStart || isSelectedEnd ? "bg-primary text-white hover:bg-primary" : ""}
                                    ${isInRange ? "bg-primary/15" : ""}`}
                            >
                                <span>{date}</span>
                                {(day?.isPeak || day?.isWeekend) && !disabled && !isSelectedStart && !isSelectedEnd && (
                                    <span className="text-[9px] leading-none text-primary">
                                        {day?.isPeak ? "성" : "주"}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {needsRoomTypeSelection && (
                    <p className="text-xs text-muted mt-3">오른쪽에서 객실을 먼저 선택해주세요.</p>
                )}
                {loading && <p className="text-xs text-muted mt-3">불러오는 중...</p>}

                <div className="flex flex-wrap gap-4 mt-6 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full bg-primary" /> 선택
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full border border-gray-300" /> 예약 가능
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full bg-gray-200" /> 예약 불가
                    </span>
                    <span>성 성수기</span>
                    <span>주 주말</span>
                </div>

                {checkIn && (
                    <p className="text-sm text-body mt-4">
                        {checkIn} {checkOut && `→ ${checkOut} (${nights.length}박)`}
                    </p>
                )}
            </div>

            <div className="w-full pc:w-80 shrink-0 h-fit pc:sticky pc:top-20 space-y-4">
                <div className="card p-5 overflow-visible">
                    <p className="text-sm text-muted mb-2">선택한 객실</p>
                    {roomTypeId ? (
                        // 딥링크(rooms/[id]의 "실시간예약하기" 등)로 들어온 경우: 객실이 고정이라 표시만 한다.
                        <p className="text-title font-bold flex items-center gap-1.5">
                            <span className="text-primary">✓</span> {roomType?.name ?? "-"}
                        </p>
                    ) : (
                        // /reserve로 바로 들어온 경우: 여기서 직접 다른 객실로 바꿀 수 있다 (커스텀 드롭다운).
                        <div className="relative" ref={pickerRef}>
                            <button
                                type="button"
                                onClick={() => setPickerOpen((v) => !v)}
                                className="w-full flex items-center justify-between gap-2 cursor-pointer"
                            >
                                <span className="text-title font-bold flex items-center gap-1.5">
                                    {roomType ? (
                                        <>
                                            <span className="text-primary">✓</span> {roomType.name}
                                        </>
                                    ) : (
                                        <span className="text-muted font-normal">객실을 선택해주세요</span>
                                    )}
                                </span>
                                <span
                                    className={`text-muted transition-transform duration-300 ${pickerOpen ? "rotate-180" : ""}`}
                                >
                                    ⌄
                                </span>
                            </button>

                            <div
                                className={`absolute left-0 right-0 top-full mt-2 z-10 card origin-top transition-all duration-300
                                    ${pickerOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}
                            >
                                {!pickerRoomTypes && <p className="p-4 text-sm text-muted">불러오는 중...</p>}
                                {pickerRoomTypes?.map((rt) => (
                                    <button
                                        key={rt.id}
                                        type="button"
                                        onClick={() => {
                                            selectRoomType(rt.id);
                                            setPickerOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface transition-colors cursor-pointer
                                            ${rt.id === selectedRoomTypeId ? "bg-surface" : ""}`}
                                    >
                                        <span className="text-sm text-title">{rt.name}</span>
                                        <span className="text-sm text-primary font-bold">
                                            {rt.base_price.toLocaleString()}원~
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {pickerError && <p className="text-sm text-red-600 mt-2">{pickerError}</p>}
                </div>

                <div className="card p-5">
                    <div className="space-y-3">
                        <div>
                            <label className="form-label">예약자 이름</label>
                            <input
                                className="form-input"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                placeholder="홍길동"
                            />
                        </div>
                        <div>
                            <label className="form-label">연락처</label>
                            <input
                                className="form-input"
                                value={guestPhone}
                                onChange={(e) => setGuestPhone(e.target.value)}
                                placeholder="010-0000-0000"
                            />
                        </div>
                        <div>
                            <label className="form-label">이메일 (선택)</label>
                            <input
                                type="email"
                                className="form-input"
                                value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)}
                                placeholder="예약 확정 메일을 받을 주소"
                            />
                        </div>
                        <div>
                            <label className="form-label">인원</label>
                            <input
                                type="number"
                                min={1}
                                max={roomType?.capacity_max ?? undefined}
                                className="form-input"
                                value={guestCount}
                                onChange={(e) => setGuestCount(Number(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-title rounded-lg p-5">
                    <div className="space-y-2 text-sm border-b border-white/10 pb-4 mb-4">
                        <div className="flex justify-between">
                            <span className="text-white/60">체크인</span>
                            <span className="text-white">{checkIn ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/60">체크아웃</span>
                            <span className="text-white">{checkOut ?? "-"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/60">숙박</span>
                            <span className="text-white">{nights.length > 0 ? `${nights.length}박` : "-"}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-baseline mb-5">
                        <span className="text-sm text-white/60">합계</span>
                        <span className="text-xl font-bold text-primary">{totalPrice.toLocaleString()}원</span>
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="btn-primary w-full"
                    >
                        {submitting ? "예약 처리 중..." : "예약 신청하기"}
                    </button>
                </div>

                {roomType && (
                    <div className="card p-5 text-xs text-muted space-y-1.5">
                        <p className="text-title font-medium mb-1">{roomType.name} 요금</p>
                        <div className="flex justify-between">
                            <span>기준 인원</span>
                            <span>{roomType.capacity_standard}인 / 최대 {roomType.capacity_max}인</span>
                        </div>
                        <div className="flex justify-between">
                            <span>평일</span>
                            <span>{roomType.base_price.toLocaleString()}원</span>
                        </div>
                        {weekendSample && (
                            <div className="flex justify-between">
                                <span>주말</span>
                                <span>{weekendSample.price.toLocaleString()}원</span>
                            </div>
                        )}
                        {peakSample && (
                            <div className="flex justify-between">
                                <span>성수기</span>
                                <span>{peakSample.price.toLocaleString()}원</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>

        {refundPolicies.length > 0 && (
            <div className="card p-5 text-xs text-muted space-y-1 mt-6">
                <p className="text-title font-medium mb-1">환불 규정</p>
                {refundPolicies.map((tier) => (
                    <p key={tier.days_before}>{formatRefundTier(tier)}</p>
                ))}
            </div>
        )}
        <Toast vaild={submitError} setVaild={setSubmitError} />
        </>
    );
}
