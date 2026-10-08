// 전화로 받은 예약 입력: 고객 화면과 같은 규칙(가용성/요금/중복방지)으로 날짜를 고르고,
// 바로 확정(계좌이체 확인 완료) 또는 결제대기로만 등록(나중에 대시보드에서 확정 처리)할 수 있다.
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { enumerateNights, toISODate } from "@/lib/reservations/pricing";
import CalendarGrid, { type DayInfo } from "@/components/reservation/CalendarGrid";
import Toast from "@/components/ui/Toast";
import { formatWon } from "@/lib/formatCurrency";
import { useFetch } from "@/hooks/useFetch";
import { useCreate } from "@/hooks/useCreate";

interface AdminRoomType {
    id: string;
    name: string;
    base_price: number;
    capacity_max: number;
    is_active: boolean;
}

interface AddonOption {
    id: string;
    name: string;
    description: string | null;
    price: number;
    is_active: boolean;
}

interface AvailabilityResponse {
    days: DayInfo[];
}

function monthCacheKey(roomTypeId: string, year: number, month: number): string {
    return `${roomTypeId}:${year}-${String(month).padStart(2, "0")}`;
}

export default function PhoneBookingForm() {
    const today = useMemo(() => new Date(), []);
    const todayISO = toISODate(today);

    const { data: roomTypesData } = useFetch<{ room_types: AdminRoomType[] }>("/api/admin/room-types");
    const activeRoomTypes = useMemo(
        () => (roomTypesData?.room_types ?? []).filter((rt) => rt.is_active),
        [roomTypesData]
    );

    const { data: addonOptionsData } = useFetch<{ addon_options: AddonOption[] }>("/api/admin/addon-options");
    const activeAddonOptions = useMemo(
        () => (addonOptionsData?.addon_options ?? []).filter((o) => o.is_active),
        [addonOptionsData]
    );

    const [roomTypeId, setRoomTypeId] = useState<string>("");
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
    const [monthsCache, setMonthsCache] = useState<Record<string, DayInfo[]>>({});
    const [calendarError, setCalendarError] = useState<string | null>(null);

    const [checkIn, setCheckIn] = useState<string | null>(null);
    const [checkOut, setCheckOut] = useState<string | null>(null);

    const [guestName, setGuestName] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [guestCount, setGuestCount] = useState(1);
    const [memo, setMemo] = useState("");
    const [confirmNow, setConfirmNow] = useState(true);
    const [optionQuantities, setOptionQuantities] = useState<Record<string, number>>({});

    const [toast, setToast] = useState<string | null>(null);

    const selectedRoomType = activeRoomTypes.find((rt) => rt.id === roomTypeId) ?? null;
    const currentKey = roomTypeId ? monthCacheKey(roomTypeId, viewYear, viewMonth) : null;
    const currentDays = currentKey ? monthsCache[currentKey] : undefined;
    // BookingCalendar.tsx와 동일하게 별도 loading state 없이 "캐시에 아직 없음"으로부터 파생한다.
    const calendarLoading = !!roomTypeId && !currentDays && !calendarError;

    useEffect(() => {
        if (!roomTypeId || !currentKey || monthsCache[currentKey]) return;

        let cancelled = false;
        const requestedKey = currentKey;

        fetch(`/api/room-types/${roomTypeId}/availability?year=${viewYear}&month=${viewMonth}`)
            .then(async (res) => {
                const result = await res.json();
                if (!res.ok) throw new Error(result.message ?? "예약 가능 정보를 불러오지 못했습니다.");
                return result as AvailabilityResponse;
            })
            .then((result) => {
                if (cancelled) return;
                setCalendarError(null);
                setMonthsCache((prev) => ({ ...prev, [requestedKey]: result.days }));
            })
            .catch((err) => {
                if (!cancelled) setCalendarError(err instanceof Error ? err.message : "예약 가능 정보를 불러오지 못했습니다.");
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomTypeId, viewYear, viewMonth]);

    const onChangeRoomType = useCallback((id: string) => {
        setRoomTypeId(id);
        setCheckIn(null);
        setCheckOut(null);
        setCalendarError(null);
    }, []);

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

    const nights = checkIn && checkOut ? enumerateNights(checkIn, checkOut) : [];
    const roomPrice = nights.reduce((sum, nightDate) => {
        if (!roomTypeId) return sum;
        const iso = toISODate(nightDate);
        const [year, month] = iso.split("-").map(Number);
        const info = monthsCache[monthCacheKey(roomTypeId, year, month)]?.find((d) => d.date === iso);
        return sum + (info?.price ?? 0);
    }, 0);

    const toggleOption = useCallback((optionId: string, checked: boolean) => {
        setOptionQuantities((prev) => {
            const next = { ...prev };
            if (checked) {
                next[optionId] = 1;
            } else {
                delete next[optionId];
            }
            return next;
        });
    }, []);

    const setOptionQuantity = useCallback((optionId: string, quantity: number) => {
        setOptionQuantities((prev) => ({ ...prev, [optionId]: Math.max(1, quantity) }));
    }, []);

    const optionsTotal = activeAddonOptions.reduce((sum, option) => {
        const quantity = optionQuantities[option.id];
        return quantity ? sum + option.price * quantity : sum;
    }, 0);

    const totalPrice = roomPrice + optionsTotal;

    const resetForm = useCallback(() => {
        setRoomTypeId("");
        setCheckIn(null);
        setCheckOut(null);
        setGuestName("");
        setGuestPhone("");
        setGuestEmail("");
        setGuestCount(1);
        setMemo("");
        setConfirmNow(true);
        setOptionQuantities({});
    }, []);

    const { create, loading: submitting, error: submitError, setError: setSubmitError } = useCreate(
        "/api/admin/reservations",
        {
            onSuccess: (result) => {
                const typed = result as { status: "HOLD" | "CONFIRMED" };
                setToast(typed.status === "CONFIRMED" ? "전화 예약이 확정 등록되었습니다." : "전화 예약이 결제대기로 등록되었습니다.");
                resetForm();
            },
        }
    );

    const onSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setSubmitError(null);

            if (!roomTypeId) {
                setSubmitError("객실을 선택해주세요.");
                return;
            }
            if (!checkIn || !checkOut) {
                setSubmitError("체크인/체크아웃 날짜를 선택해주세요.");
                return;
            }
            if (!guestName.trim() || !guestPhone.trim()) {
                setSubmitError("예약자 이름과 연락처를 입력해주세요.");
                return;
            }

            create({
                room_type_id: roomTypeId,
                check_in: checkIn,
                check_out: checkOut,
                guest_name: guestName,
                guest_phone: guestPhone,
                guest_email: guestEmail || undefined,
                guest_count: guestCount,
                memo: memo || undefined,
                confirm_now: confirmNow,
                addon_options: Object.entries(optionQuantities).map(([addon_option_id, quantity]) => ({
                    addon_option_id,
                    quantity,
                })),
            });
        },
        [roomTypeId, checkIn, checkOut, guestName, guestPhone, guestEmail, guestCount, memo, confirmNow, optionQuantities, create, setSubmitError]
    );

    return (
        <div className="flex flex-col pc:flex-row gap-6">
            <div className="card p-6 flex-1">
                <div className="mb-4">
                    <label htmlFor="phone-booking-room-type" className="form-label">객실</label>
                    <select
                        id="phone-booking-room-type"
                        className="form-input"
                        value={roomTypeId}
                        onChange={(e) => onChangeRoomType(e.target.value)}
                    >
                        <option value="">객실을 선택해주세요</option>
                        {activeRoomTypes.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                                {rt.name} · {formatWon(rt.base_price)}~
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center justify-between mb-4">
                    <button type="button" onClick={goPrevMonth} className="btn-ghost px-3 py-1.5" aria-label="이전 달" disabled={!roomTypeId}>
                        ‹
                    </button>
                    <p className="text-lg font-bold text-title">
                        {viewYear}년 {viewMonth}월
                    </p>
                    <button type="button" onClick={goNextMonth} className="btn-ghost px-3 py-1.5" aria-label="다음 달" disabled={!roomTypeId}>
                        ›
                    </button>
                </div>

                {calendarError && <p className="text-sm text-red-600 mb-3">{calendarError}</p>}

                <div className="relative">
                    {calendarLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-lg">
                            <span className="text-xs text-muted">불러오는 중...</span>
                        </div>
                    )}

                    {roomTypeId ? (
                        <CalendarGrid
                            viewYear={viewYear}
                            viewMonth={viewMonth}
                            days={currentDays}
                            todayISO={todayISO}
                            checkIn={checkIn}
                            checkOut={checkOut}
                            onDateClick={handleDateClick}
                        />
                    ) : (
                        <p className="text-sm text-muted py-8 text-center">객실을 먼저 선택해주세요.</p>
                    )}
                </div>

                {checkIn && (
                    <p className="text-sm text-body mt-4">
                        {checkIn} {checkOut && `→ ${checkOut} (${nights.length}박)`}
                    </p>
                )}
            </div>

            <form onSubmit={onSubmit} className="w-full pc:w-96 shrink-0 h-fit space-y-4">
                <div className="card p-5 space-y-3">
                    <div>
                        <label className="form-label">이름 *</label>
                        <input className="form-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="홍길동" />
                    </div>
                    <div>
                        <label className="form-label">연락처 *</label>
                        <input className="form-input" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="010-1234-5678" />
                    </div>
                    <div>
                        <label className="form-label">이메일 (선택)</label>
                        <input type="email" className="form-input" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
                    </div>
                    <div>
                        <label className="form-label">인원</label>
                        <input
                            type="number"
                            min={1}
                            max={selectedRoomType?.capacity_max ?? undefined}
                            className="form-input"
                            value={guestCount}
                            onChange={(e) => setGuestCount(Number(e.target.value) || 1)}
                        />
                    </div>
                    <div>
                        <label className="form-label">메모</label>
                        <textarea
                            rows={2}
                            className="form-input"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                            placeholder="예) 보호자 동반, 오후 통화 선호"
                        />
                    </div>
                    {activeAddonOptions.length > 0 && (
                        <div>
                            <label className="form-label">부가서비스/옵션</label>
                            <div className="space-y-1.5">
                                {activeAddonOptions.map((option) => {
                                    const checked = option.id in optionQuantities;
                                    return (
                                        <div key={option.id} className="flex items-center gap-2 text-sm text-body">
                                            <label className="flex items-center gap-2 flex-1 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => toggleOption(option.id, e.target.checked)}
                                                />
                                                <span className="truncate">{option.name}</span>
                                                <span className="text-xs text-muted shrink-0">{formatWon(option.price)}</span>
                                            </label>
                                            {checked && (
                                                <input
                                                    type="number"
                                                    min={1}
                                                    className="form-input w-16 shrink-0"
                                                    value={optionQuantities[option.id]}
                                                    onChange={(e) => setOptionQuantity(option.id, Number(e.target.value) || 1)}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <label className="flex items-center gap-2 text-sm text-body">
                        <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} />
                        바로 확정 (계좌이체 확인 완료)
                    </label>
                </div>

                <div className="bg-title rounded-lg p-5">
                    <div className="flex justify-between items-baseline mb-5">
                        <span className="text-sm text-white/60">합계</span>
                        <span className="text-xl font-bold text-primary">{formatWon(totalPrice)}</span>
                    </div>
                    <button type="submit" disabled={submitting} className="btn-primary w-full">
                        {submitting ? "등록 중..." : "전화 예약 등록"}
                    </button>
                </div>
            </form>

            <Toast vaild={toast} setVaild={setToast} />
            <Toast vaild={submitError} setVaild={setSubmitError} />
        </div>
    );
}
