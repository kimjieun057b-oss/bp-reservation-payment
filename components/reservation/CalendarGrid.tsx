"use client";

// BookingCalendar(고객용)와 관리자 전화 예약 폼이 공유하는 달력 그리드.
// 날짜별 가용 여부/가격 표시와 체크인~체크아웃 선택 하이라이트만 담당하는 순수 컴포넌트.

export interface DayInfo {
    date: string;
    available: boolean;
    isPeak: boolean;
    isWeekend: boolean;
    price: number;
}

export interface CalendarGridProps {
    viewYear: number;
    viewMonth: number;
    days: DayInfo[] | undefined;
    todayISO: string;
    checkIn: string | null;
    checkOut: string | null;
    onDateClick: (day: DayInfo) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarGrid({ viewYear, viewMonth, days, todayISO, checkIn, checkOut, onDateClick }: CalendarGridProps) {
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
    const leadingBlanks = Array.from({ length: firstWeekday }, (_, i) => i);
    const dateCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
        <>
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
                    // FR-1 AC3: 예약 마감(재고 소진)은 과거 날짜와 구분해 "마감" 배지로 명확히 표시한다.
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
                                (day?.isPeak || day?.isWeekend) && !disabled && !isSelectedStart && !isSelectedEnd && (
                                    <span className="text-[9px] leading-none text-primary">
                                        {day?.isPeak ? "성" : "주"}
                                    </span>
                                )
                            )}
                        </button>
                    );
                })}
            </div>
        </>
    );
}
