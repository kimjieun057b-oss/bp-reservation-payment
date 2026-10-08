"use client";

// 실시간예약2 (버전2 UI) 마법사 오케스트레이터.
// 기존 BookingCalendar.tsx/CheckoutPanel.tsx와 동일한 API를 그대로 재사용하되, 화면을
// 객실선택 -> 날짜선택 -> 옵션선택 -> 예약자정보 -> 예약완료 5단계로 나눠 보여준다.
// rooms/[id]의 "실시간예약하기"에서 넘어온 경우(roomTypeId prop 있음) 1단계에서
// 해당 객실이 자동으로 선택되어 있어야 한다는 요구사항 때문에, roomTypeId 유무로
// selectedRoomTypeId 초기값과 잠금 여부를 분기한다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { enumerateNights, toISODate } from "@/lib/reservations/pricing";
import type { RefundPolicyTier } from "@/lib/reservations/refund";
import Toast from "@/components/ui/Toast";
import StepIndicator from "./StepIndicator";
import StepRoomSelect from "./StepRoomSelect";
import StepDateSelect from "./StepDateSelect";
import StepOptionSelect from "./StepOptionSelect";
import StepGuestInfo from "./StepGuestInfo";
import StepComplete from "./StepComplete";
import { WIZARD_STEP_LABELS } from "./types";
import type { AddonInfo, AvailabilityResponse, DayInfo, RoomTypeInfo } from "./types";

export interface BookingWizardV2Props {
    roomTypeId?: string;
}

function monthKeyOf(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, "0")}`;
}

function monthCacheKey(roomTypeId: string, year: number, month: number): string {
    return `${roomTypeId}:${monthKeyOf(year, month)}`;
}

export default function BookingWizardV2({ roomTypeId }: BookingWizardV2Props) {
    const today = useMemo(() => new Date(), []);
    const todayISO = toISODate(today);

    const [step, setStep] = useState(1);

    // 01. 객실선택
    const [roomTypes, setRoomTypes] = useState<RoomTypeInfo[] | null>(null);
    const [roomTypesError, setRoomTypesError] = useState<string | null>(null);
    const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string | null>(roomTypeId ?? null);
    const locked = !!roomTypeId;

    // 02. 날짜선택
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
    const [roomTypeCache, setRoomTypeCache] = useState<Record<string, RoomTypeInfo>>({});
    const [refundPoliciesCache, setRefundPoliciesCache] = useState<Record<string, RefundPolicyTier[]>>({});
    const [monthsCache, setMonthsCache] = useState<Record<string, DayInfo[]>>({});
    const [loadError, setLoadError] = useState<string | null>(null);
    const [checkIn, setCheckIn] = useState<string | null>(null);
    const [checkOut, setCheckOut] = useState<string | null>(null);

    // 03. 옵션선택
    const [addons, setAddons] = useState<AddonInfo[] | null>(null);
    const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});

    // 04. 예약자정보
    const [guestName, setGuestName] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [guestCount, setGuestCount] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // 05. 예약완료
    const [reservationId, setReservationId] = useState<string | null>(null);

    // 객실 목록은 잠금 여부와 무관하게 항상 불러온다 (잠긴 경우엔 1단계에서 해당 객실 1장만 보여주는 데 쓴다).
    useEffect(() => {
        let cancelled = false;

        fetch("/api/room-types")
            .then(async (res) => {
                const result = await res.json();
                if (!res.ok) throw new Error(result.message ?? "객실 목록을 불러오지 못했습니다.");
                return result.room_types as RoomTypeInfo[];
            })
            .then((list) => {
                if (!cancelled) setRoomTypes(list);
            })
            .catch((err) => {
                if (!cancelled) setRoomTypesError(err instanceof Error ? err.message : "객실 목록을 불러오지 못했습니다.");
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // 옵션 상품은 객실과 무관한 공통 목록이라 최초 1회만 불러온다.
    useEffect(() => {
        let cancelled = false;

        fetch("/api/addons")
            .then(async (res) => {
                const result = await res.json();
                if (!res.ok) throw new Error(result.message ?? "옵션 목록을 불러오지 못했습니다.");
                return result.addons as AddonInfo[];
            })
            .then((list) => {
                if (!cancelled) setAddons(list);
            })
            .catch(() => {
                if (!cancelled) setAddons([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const currentKey = selectedRoomTypeId ? monthCacheKey(selectedRoomTypeId, viewYear, viewMonth) : null;
    const currentDays = currentKey ? monthsCache[currentKey] : undefined;
    const roomType = selectedRoomTypeId ? (roomTypeCache[selectedRoomTypeId] ?? null) : null;
    const refundPolicies = selectedRoomTypeId ? (refundPoliciesCache[selectedRoomTypeId] ?? []) : [];
    const calendarLoading = !!selectedRoomTypeId && !currentDays && !loadError;

    // 선택된 객실의 월별 가용성. 캐시에 없을 때만 요청한다.
    useEffect(() => {
        if (!selectedRoomTypeId || !currentKey || monthsCache[currentKey]) return;

        let cancelled = false;
        const requestedRoomTypeId = selectedRoomTypeId;
        const requestedKey = currentKey;

        fetch(`/api/room-types/${requestedRoomTypeId}/availability?year=${viewYear}&month=${viewMonth}`)
            .then(async (res) => {
                const result = await res.json();
                if (!res.ok) throw new Error(result.message ?? "예약 가능 정보를 불러오지 못했습니다.");
                return result as AvailabilityResponse;
            })
            .then((result) => {
                if (cancelled) return;
                setLoadError(null);
                setRoomTypeCache((prev) => ({ ...prev, [requestedRoomTypeId]: result.room_type }));
                setRefundPoliciesCache((prev) => ({ ...prev, [requestedRoomTypeId]: result.refund_policies }));
                setMonthsCache((prev) => ({ ...prev, [requestedKey]: result.days }));
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err.message);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRoomTypeId, viewYear, viewMonth]);

    const selectRoomType = useCallback((id: string) => {
        setSelectedRoomTypeId(id);
        setCheckIn(null);
        setCheckOut(null);
        setLoadError(null);
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

    const changeAddonQuantity = useCallback((addonId: string, delta: number) => {
        setAddonQuantities((prev) => {
            const next = Math.max(0, (prev[addonId] ?? 0) + delta);
            return { ...prev, [addonId]: next };
        });
    }, []);

    const nights = checkIn && checkOut ? enumerateNights(checkIn, checkOut) : [];

    const roomTotal = nights.reduce((sum, nightDate) => {
        if (!selectedRoomTypeId) return sum;
        const iso = toISODate(nightDate);
        const [year, month] = iso.split("-").map(Number);
        const info = monthsCache[monthCacheKey(selectedRoomTypeId, year, month)]?.find((d) => d.date === iso);
        return sum + (info?.price ?? 0);
    }, 0);

    const addonsTotal = (addons ?? []).reduce(
        (sum, addon) => sum + addon.price * (addonQuantities[addon.id] ?? 0),
        0
    );

    async function handleSubmitGuestInfo() {
        setSubmitError(null);

        if (!selectedRoomTypeId || !checkIn || !checkOut) return;

        if (!guestName.trim() || !guestPhone.trim()) {
            setSubmitError("예약자 이름과 연락처를 입력해주세요.");
            return;
        }

        setSubmitting(true);
        try {
            const selectedAddons = Object.entries(addonQuantities)
                .filter(([, quantity]) => quantity > 0)
                .map(([addon_id, quantity]) => ({ addon_id, quantity }));

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
                    addons: selectedAddons,
                }),
            });
            const result = await res.json();

            if (!res.ok) {
                setSubmitError(result.message ?? "예약에 실패했습니다.");
                return;
            }

            setReservationId(result.reservation_id);
            setStep(5);
        } catch {
            setSubmitError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSubmitting(false);
        }
    }

    const stepRoomTypes = locked ? (roomTypes?.filter((rt) => rt.id === roomTypeId) ?? null) : roomTypes;

    return (
        <div>
            <StepIndicator
                currentStep={step}
                labels={WIZARD_STEP_LABELS}
                onStepClick={step < 5 ? (target) => setStep(target) : undefined}
            />

            {step === 1 && (
                <StepRoomSelect
                    roomTypes={stepRoomTypes}
                    error={roomTypesError}
                    selectedId={selectedRoomTypeId}
                    locked={locked}
                    onSelect={selectRoomType}
                    onNext={() => setStep(2)}
                />
            )}

            {step === 2 && (
                <StepDateSelect
                    roomTypeName={roomType?.name}
                    viewYear={viewYear}
                    viewMonth={viewMonth}
                    onPrevMonth={goPrevMonth}
                    onNextMonth={goNextMonth}
                    days={currentDays}
                    loading={calendarLoading}
                    loadError={loadError}
                    todayISO={todayISO}
                    checkIn={checkIn}
                    checkOut={checkOut}
                    nights={nights.length}
                    onDateClick={handleDateClick}
                    onBack={() => setStep(1)}
                    onNext={() => setStep(3)}
                />
            )}

            {step === 3 && (
                <StepOptionSelect
                    addons={addons}
                    quantities={addonQuantities}
                    onChange={changeAddonQuantity}
                    onBack={() => setStep(2)}
                    onNext={() => setStep(4)}
                />
            )}

            {step === 4 && (
                <StepGuestInfo
                    guestName={guestName}
                    guestPhone={guestPhone}
                    guestEmail={guestEmail}
                    guestCount={guestCount}
                    capacityMax={roomType?.capacity_max}
                    onChangeName={setGuestName}
                    onChangePhone={setGuestPhone}
                    onChangeEmail={setGuestEmail}
                    onChangeCount={setGuestCount}
                    summary={{
                        roomTypeName: roomType?.name,
                        checkIn,
                        checkOut,
                        nights: nights.length,
                        roomTotal,
                        addonsTotal,
                    }}
                    refundPolicies={refundPolicies}
                    submitting={submitting}
                    onBack={() => setStep(3)}
                    onSubmit={handleSubmitGuestInfo}
                />
            )}

            {step === 5 && reservationId && <StepComplete reservationId={reservationId} />}

            <Toast vaild={submitError} setVaild={setSubmitError} />
        </div>
    );
}
