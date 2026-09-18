"use client";

import type { DayInfo } from "./types";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export interface StepDateSelectProps {
    roomTypeName: string | undefined;
    viewYear: number;
    viewMonth: number;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    days: DayInfo[] | undefined;
    loading: boolean;
    loadError: string | null;
    todayISO: string;
    checkIn: string | null;
    checkOut: string | null;
    nights: number;
    onDateClick: (day: DayInfo) => void;
    onBack: () => void;
    onNext: () => void;
}

export default function StepDateSelect({
    roomTypeName,
    viewYear,
    viewMonth,
    onPrevMonth,
    onNextMonth,
    days,
    loading,
    loadError,
    todayISO,
    checkIn,
    checkOut,
    nights,
    onDateClick,
    onBack,
    onNext,
}: StepDateSelectProps) {
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => i);
    const dateCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
        <div className="card p-6">
            <p className="text-lg font-bold text-title mb-1">02. 날짜 선택</p>
            <p className="text-sm text-muted mb-6">
                체크인 / 체크아웃 날짜를 선택해주세요.
                {roomTypeName && <> · <span className="text-title font-medium">{roomTypeName}</span></>}
            </p>

            <div className="flex flex-col pc:flex-row gap-6">
                <div className="w-full pc:w-56 shrink-0 space-y-3">
                    <div>
                        <label className="form-label">체크인</label>
                        <div className="form-input flex items-center bg-surface">{checkIn ?? "-"}</div>
                    </div>
                    <div>
                        <label className="form-label">체크아웃</label>
                        <div className="form-input flex items-center bg-surface">{checkOut ?? "-"}</div>
                    </div>
                    {checkIn && checkOut && <p className="text-sm text-body">{nights}박</p>}

                    <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-3 rounded-full bg-primary" /> 선택
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-3 rounded-full border border-gray-300" /> 가능
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 h-3 rounded-full bg-gray-100 border border-gray-300" /> 마감
                        </span>
                    </div>
                </div>

                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                        <button type="button" onClick={onPrevMonth} className="btn-ghost px-3 py-1.5" aria-label="이전 달">
                            ‹
                        </button>
                        <p className="text-lg font-bold text-title">
                            {viewYear}년 {viewMonth}월
                        </p>
                        <button type="button" onClick={onNextMonth} className="btn-ghost px-3 py-1.5" aria-label="다음 달">
                            ›
                        </button>
                    </div>

                    {loadError && <p className="text-sm text-red-600 mb-3">{loadError}</p>}

                    <div className="relative">
                        {loading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-lg">
                                <span className="text-xs text-muted">불러오는 중...</span>
                            </div>
                        )}

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
                                const day = days?.find((d) => d.date === iso);
                                const isPast = iso < todayISO;
                                const isSelectedStart = iso === checkIn;
                                const isSelectedEnd = iso === checkOut;
                                const isInRange = !!checkIn && !!checkOut && iso > checkIn && iso < checkOut;
                                const isSoldOut = !isPast && !!day && !day.available;
                                const disabled = isPast || !day || !day.available;

                                return (
                                    <button
                                        key={iso}
                                        type="button"
                                        disabled={disabled}
                                        aria-disabled={disabled}
                                        aria-label={isSoldOut ? `${date}일, 마감` : undefined}
                                        onClick={() => day && onDateClick(day)}
                                        className={`relative aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors
                                            ${disabled ? "text-muted/50 cursor-not-allowed" : "cursor-pointer hover:bg-surface"}
                                            ${isSoldOut ? "bg-gray-100" : ""}
                                            ${isSelectedStart || isSelectedEnd ? "bg-primary text-white hover:bg-primary" : ""}
                                            ${isInRange ? "bg-primary/15" : ""}`}
                                    >
                                        <span>{date}</span>
                                        {isSoldOut ? (
                                            <span className="text-[9px] leading-none text-muted font-medium">마감</span>
                                        ) : (
                                            (day?.isPeak || day?.isWeekend) &&
                                            !disabled &&
                                            !isSelectedStart &&
                                            !isSelectedEnd && (
                                                <span className="text-[9px] leading-none text-primary">
                                                    {day?.isPeak ? "성" : "주"}
                                                </span>
                                            )
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-between mt-8">
                <button type="button" onClick={onBack} className="btn-ghost px-8">
                    이전
                </button>
                <button type="button" onClick={onNext} disabled={!checkIn || !checkOut} className="btn-primary px-8">
                    다음 단계
                </button>
            </div>
        </div>
    );
}
