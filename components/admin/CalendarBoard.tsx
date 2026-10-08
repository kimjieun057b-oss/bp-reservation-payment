// 예약 캘린더: 세로=객실, 가로=날짜(일/주 보기)로 예약을 한눈에 보고, 블록을 눌러 바로
// 확정/체크인/체크아웃/강제취소까지 처리한다. 상태 변경은 전부 기존 PATCH API를 그대로 재사용한다
// (confirm/checkin/checkout/cancel) - 새로 만든 건 "겹침 기준 조회" API 하나뿐이다.
"use client";
import { useCallback, useMemo, useState } from "react";
import { toISODate } from "@/lib/reservations/pricing";
import { formatDateOnly, formatLocalDate, formatLocalTime } from "@/lib/formatDate";
import { formatWon } from "@/lib/formatCurrency";
import { useFetch } from "@/hooks/useFetch";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";

interface RoomRow {
    id: string;
    name: string;
    room_type_id: string;
    room_types: { name: string } | null;
}

interface CalendarReservation {
    id: string;
    room_id: string;
    guest_name: string;
    guest_phone: string;
    guest_email: string | null;
    check_in: string;
    check_out: string;
    status: "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
    source: "ONLINE" | "PHONE";
    total_price: number;
    refund_amount: number | null;
    cancel_reason: string | null;
    hold_expire_at: string | null;
    checked_in_at: string | null;
    checked_out_at: string | null;
    created_at: string;
    cancelled_at: string | null;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
    reservation_options: { name: string; price: number; quantity: number }[];
}

interface CalendarResponse {
    rooms: RoomRow[];
    reservations: CalendarReservation[];
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 그리드 블록은 바탕(흰 카드) 위에서도 날짜 경계선이 비치도록 60% 불투명도를 쓴다.
// 범례 점은 블록과 같은 색으로 보이도록 동일하게 /60을 적용한다.
const LEGEND: { label: string; dot: string }[] = [
    { label: "결제대기", dot: "bg-amber-400/60" },
    { label: "확정", dot: "bg-primary/60" },
    { label: "체크인", dot: "bg-green-500/60" },
    { label: "완료", dot: "bg-gray-400/60" },
    { label: "노쇼", dot: "bg-red-500/60" },
    { label: "취소", dot: "bg-gray-200/60" },
    { label: "만료", dot: "bg-gray-100/60 border border-gray-300" },
];

function statusStyle(res: CalendarReservation): { label: string; className: string } {
    if (res.status === "HOLD") return { label: "결제대기", className: "bg-amber-400/60 text-amber-950" };
    if (res.status === "CONFIRMED") {
        if (res.checked_out_at) return { label: "완료", className: "bg-gray-400/60 text-white" };
        if (res.checked_in_at) return { label: "체크인", className: "bg-green-500/60 text-green-950" };
        return { label: "확정", className: "bg-primary/60 text-white" };
    }
    if (res.status === "CANCELLED") {
        if (res.cancel_reason === "NO_SHOW") return { label: "노쇼", className: "bg-red-500/60 text-red-950" };
        return { label: "취소", className: "bg-gray-200/60 text-gray-600" };
    }
    return { label: "만료", className: "bg-gray-100/60 text-gray-500 border border-gray-300" };
}

function addDaysStr(dateStr: string, delta: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + delta);
    return toISODate(date);
}

function mondayOf(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    return toISODate(date);
}

// rangeStart로부터 며칠째인지(0-based)를 구하고, 그리드 칸 범위([0, dateCount]) 밖이면 clamp한다.
function dayIndexClamped(dateStr: string, rangeStart: string, dateCount: number): number {
    const [y1, m1, d1] = rangeStart.split("-").map(Number);
    const [y2, m2, d2] = dateStr.split("-").map(Number);
    const diffDays = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
    return Math.min(Math.max(diffDays, 0), dateCount);
}

// 같은 객실에서 겹치는 예약(취소 포함 시에만 발생 가능 - HOLD/CONFIRMED끼리는 DB 제약으로 겹칠 수 없음)을
// 그리디하게 레인에 배정해 세로로 쌓는다. 각 레인은 서로 겹치지 않는 예약들의 시간순 목록.
function assignLanes(reservations: CalendarReservation[]): CalendarReservation[][] {
    const sorted = [...reservations].sort((a, b) => a.check_in.localeCompare(b.check_in));
    const lanes: CalendarReservation[][] = [];
    const laneEnds: string[] = [];

    for (const res of sorted) {
        const laneIndex = laneEnds.findIndex((end) => res.check_in >= end);
        if (laneIndex === -1) {
            lanes.push([res]);
            laneEnds.push(res.check_out);
        } else {
            lanes[laneIndex].push(res);
            laneEnds[laneIndex] = res.check_out;
        }
    }

    return lanes;
}

function todayValue(): string {
    return toISODate(new Date());
}

export default function CalendarBoard() {
    const todayISO = useMemo(() => todayValue(), []);
    const [viewMode, setViewMode] = useState<"day" | "week">("week");
    const [anchorDate, setAnchorDate] = useState(todayISO);
    const [includeCancelled, setIncludeCancelled] = useState(false);
    const [selected, setSelected] = useState<CalendarReservation | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const dateCount = viewMode === "week" ? 7 : 1;
    const rangeStart = viewMode === "week" ? mondayOf(anchorDate) : anchorDate;
    const dates = useMemo(
        () => Array.from({ length: dateCount }, (_, i) => addDaysStr(rangeStart, i)),
        [rangeStart, dateCount]
    );
    const rangeEnd = dates[dates.length - 1];

    const url = `/api/admin/calendar?date_from=${rangeStart}&date_to=${rangeEnd}&include_cancelled=${includeCancelled}`;
    const { data, loading, error, refetch } = useFetch<CalendarResponse>(url);

    const sortedRooms = useMemo(() => {
        const rooms = data?.rooms ?? [];
        return [...rooms].sort((a, b) => {
            const typeDiff = (a.room_types?.name ?? "").localeCompare(b.room_types?.name ?? "");
            return typeDiff !== 0 ? typeDiff : a.name.localeCompare(b.name);
        });
    }, [data]);

    const reservationsByRoom = useMemo(() => {
        const map = new Map<string, CalendarReservation[]>();
        for (const r of data?.reservations ?? []) {
            if (!map.has(r.room_id)) map.set(r.room_id, []);
            map.get(r.room_id)!.push(r);
        }
        return map;
    }, [data]);

    const goPrev = useCallback(() => {
        setAnchorDate((d) => addDaysStr(d, viewMode === "week" ? -7 : -1));
    }, [viewMode]);

    const goNext = useCallback(() => {
        setAnchorDate((d) => addDaysStr(d, viewMode === "week" ? 7 : 1));
    }, [viewMode]);

    const goToday = useCallback(() => setAnchorDate(todayISO), [todayISO]);

    const runAction = useCallback(
        async (url: string, method: string, body: unknown, successMsg: string) => {
            setActionLoading(true);
            try {
                const response = await fetch(url, {
                    method,
                    headers: body ? { "Content-Type": "application/json" } : undefined,
                    body: body ? JSON.stringify(body) : undefined,
                });
                const result = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(result?.message || "처리에 실패했습니다.");
                }

                refetch();
                setToast(successMsg);
                setSelected(null);
            } catch (err) {
                setToast(err instanceof Error ? err.message : "처리에 실패했습니다.");
            } finally {
                setActionLoading(false);
            }
        },
        [refetch]
    );

    const handleCancel = useCallback(() => {
        if (!selected) return;
        const reason = window.prompt("취소 사유를 입력해주세요.");
        if (!reason || !reason.trim()) return;
        runAction(`/api/admin/reservations/${selected.id}/cancel`, "PATCH", { reason: reason.trim() }, "취소 처리되었습니다.");
    }, [selected, runAction]);

    return (
        <div className="space-y-4">
            <div className="card p-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                        type="button"
                        className={`px-3 py-1.5 text-sm cursor-pointer ${viewMode === "day" ? "bg-primary text-white" : "bg-white text-body"}`}
                        onClick={() => setViewMode("day")}
                    >
                        일
                    </button>
                    <button
                        type="button"
                        className={`px-3 py-1.5 text-sm cursor-pointer ${viewMode === "week" ? "bg-primary text-white" : "bg-white text-body"}`}
                        onClick={() => setViewMode("week")}
                    >
                        주
                    </button>
                </div>
                <button type="button" onClick={goPrev} className="btn-ghost px-3 py-1.5" aria-label="이전">‹</button>
                <p className="text-sm font-medium text-title min-w-40 text-center">
                    {viewMode === "week" ? `${rangeStart} ~ ${rangeEnd}` : rangeStart}
                </p>
                <button type="button" onClick={goNext} className="btn-ghost px-3 py-1.5" aria-label="다음">›</button>
                <button type="button" onClick={goToday} className="btn-ghost">오늘로 이동</button>
                <label className="flex items-center gap-2 text-sm text-body ml-auto">
                    <input
                        type="checkbox"
                        checked={includeCancelled}
                        onChange={(e) => setIncludeCancelled(e.target.checked)}
                    />
                    취소 포함
                </label>
            </div>

            {loading ? (
                <Loading contents="캘린더를 불러오는 중입니다..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : sortedRooms.length === 0 ? (
                <p className="card p-6 text-sm text-center text-muted">등록된 객실이 없습니다.</p>
            ) : (
                <div className="card p-4 overflow-x-auto">
                    <div className="min-w-160">
                        <div className="flex">
                            <div className="w-40 shrink-0 border-b border-gray-200" />
                            <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${dateCount}, 1fr)` }}>
                                {dates.map((date, idx) => {
                                    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
                                    const isToday = date === todayISO;
                                    return (
                                        <div
                                            key={date}
                                            className={`text-center text-xs py-2 font-medium border-b border-gray-200 ${idx < dates.length - 1 ? "border-r border-gray-100" : ""} ${isToday ? "text-primary bg-primary/5" : "text-muted"}`}
                                        >
                                            {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))} ({WEEKDAY_LABELS[weekday]})
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {sortedRooms.map((room) => {
                            const lanes = assignLanes(reservationsByRoom.get(room.id) ?? []);
                            const laneCount = Math.max(1, lanes.length);
                            return (
                                <div key={room.id} className="flex border-t border-gray-100">
                                    <div className="w-40 shrink-0 py-2 pr-3 flex flex-col justify-center">
                                        <p className="text-sm font-medium text-title truncate">{room.name}</p>
                                        <p className="text-xs text-muted truncate">{room.room_types?.name}</p>
                                    </div>
                                    <div
                                        className="flex-1 grid relative"
                                        style={{
                                            gridTemplateColumns: `repeat(${dateCount}, 1fr)`,
                                            gridTemplateRows: `repeat(${laneCount}, 44px)`,
                                        }}
                                    >
                                        {/* 날짜 경계선: 블록이 정확히 하루 칸에만 걸쳐 있는지 한눈에 보이도록 세로 구분선을 깐다 */}
                                        {dates.map((date, idx) => (
                                            <div
                                                key={`sep-${date}`}
                                                style={{ gridColumn: idx + 1, gridRow: `1 / span ${laneCount}` }}
                                                className={`${idx < dates.length - 1 ? "border-r border-gray-100" : ""} ${date === todayISO ? "bg-primary/5" : ""}`}
                                            />
                                        ))}

                                        {lanes.map((lane, laneIdx) =>
                                            lane.map((res) => {
                                                const startIdx = dayIndexClamped(res.check_in, rangeStart, dateCount);
                                                const endIdx = dayIndexClamped(res.check_out, rangeStart, dateCount);
                                                const style = statusStyle(res);
                                                return (
                                                    <button
                                                        key={res.id}
                                                        type="button"
                                                        onClick={() => setSelected(res)}
                                                        style={{ gridColumn: `${startIdx + 1} / ${endIdx + 1}`, gridRow: laneIdx + 1 }}
                                                        className={`mx-0.5 my-0.5 rounded px-1.5 py-0.5 flex flex-col justify-center overflow-hidden text-left cursor-pointer ${style.className}`}
                                                        title={`${res.guest_name} · ${style.label}`}
                                                    >
                                                        <span className="text-base leading-tight truncate">{res.guest_name}</span>
                                                        <span className="mt-1 text-xs leading-tight truncate opacity-90">{style.label}</span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100 text-xs text-muted">
                        {LEGEND.map((l) => (
                            <span key={l.label} className="inline-flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-sm ${l.dot}`} /> {l.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {selected && (
                <>
                    <div className="card fixed top-1/2 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto">
                        <div className="px-6 pt-6 pb-5">
                            <div className="flex items-center justify-between mb-4">
                                <span className={`badge ${statusStyle(selected).className}`}>{statusStyle(selected).label}</span>
                                <button type="button" onClick={() => setSelected(null)} className="text-muted hover:text-title cursor-pointer" aria-label="닫기">
                                    ✕
                                </button>
                            </div>

                            <p className="text-lg font-bold text-title mb-1">{selected.guest_name}</p>
                            <p className="text-sm text-muted mb-4">
                                {selected.room_types?.name}
                                {selected.rooms?.name ? ` (${selected.rooms.name})` : ""} · {formatDateOnly(selected.check_in)} ~ {formatDateOnly(selected.check_out)}
                            </p>

                            <div className="space-y-1.5 text-sm text-body border-t border-gray-100 pt-4 mb-4">
                                <div className="flex justify-between">
                                    <span className="text-muted">연락처</span>
                                    <span>{selected.guest_phone}</span>
                                </div>
                                {selected.guest_email && (
                                    <div className="flex justify-between">
                                        <span className="text-muted">이메일</span>
                                        <span>{selected.guest_email}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-muted">경로</span>
                                    <span>{selected.source === "PHONE" ? "전화" : "온라인"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted">금액</span>
                                    <span>{formatWon(selected.total_price)}</span>
                                </div>
                                {selected.reservation_options.length > 0 && (
                                    <div className="pl-3 space-y-1 text-xs text-muted">
                                        {selected.reservation_options.map((opt, idx) => (
                                            <div key={idx} className="flex justify-between">
                                                <span>{opt.name} × {opt.quantity}</span>
                                                <span>{formatWon(opt.price * opt.quantity)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selected.status === "CANCELLED" && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-muted">환불액</span>
                                            <span>{formatWon(selected.refund_amount ?? 0)}</span>
                                        </div>
                                        {selected.cancel_reason && (
                                            <div className="flex justify-between">
                                                <span className="text-muted">취소 사유</span>
                                                <span>{selected.cancel_reason}</span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="space-y-1 text-xs text-muted border-t border-gray-100 pt-4 mb-5">
                                <p>접수 {formatLocalDate(selected.created_at)} {formatLocalTime(selected.created_at)}</p>
                                {selected.checked_in_at && (
                                    <p>체크인 {formatLocalDate(selected.checked_in_at)} {formatLocalTime(selected.checked_in_at)}</p>
                                )}
                                {selected.checked_out_at && (
                                    <p>체크아웃 {formatLocalDate(selected.checked_out_at)} {formatLocalTime(selected.checked_out_at)}</p>
                                )}
                                {selected.cancelled_at && (
                                    <p>취소 {formatLocalDate(selected.cancelled_at)} {formatLocalTime(selected.cancelled_at)}</p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {selected.status === "HOLD" && selected.source === "PHONE" && (
                                    <button
                                        type="button"
                                        className="btn-primary flex-1"
                                        disabled={actionLoading}
                                        onClick={() => runAction(`/api/admin/reservations/${selected.id}/confirm`, "PATCH", undefined, "확정 처리되었습니다.")}
                                    >
                                        확정 처리
                                    </button>
                                )}
                                {selected.status === "HOLD" && selected.source === "ONLINE" && (
                                    <p className="text-xs text-muted flex-1">고객 결제 대기 중입니다.</p>
                                )}
                                {selected.status === "CONFIRMED" && !selected.checked_in_at && (
                                    <>
                                        <button
                                            type="button"
                                            className="btn-primary flex-1"
                                            disabled={actionLoading}
                                            onClick={() => runAction(`/api/admin/reservations/${selected.id}/checkin`, "PATCH", undefined, "체크인 처리되었습니다.")}
                                        >
                                            체크인 처리
                                        </button>
                                        <button type="button" className="btn-danger" disabled={actionLoading} onClick={handleCancel}>
                                            강제 취소
                                        </button>
                                    </>
                                )}
                                {selected.status === "CONFIRMED" && selected.checked_in_at && !selected.checked_out_at && (
                                    <>
                                        <button
                                            type="button"
                                            className="btn-primary flex-1"
                                            disabled={actionLoading}
                                            onClick={() => runAction(`/api/admin/reservations/${selected.id}/checkout`, "PATCH", undefined, "체크아웃 처리되었습니다.")}
                                        >
                                            체크아웃 처리
                                        </button>
                                        <button type="button" className="btn-danger" disabled={actionLoading} onClick={handleCancel}>
                                            강제 취소
                                        </button>
                                    </>
                                )}
                                {selected.status === "CONFIRMED" && selected.checked_out_at && (
                                    <p className="text-xs text-muted flex-1">체크아웃이 완료된 예약입니다.</p>
                                )}
                                {selected.status === "EXPIRED" && (
                                    <p className="text-xs text-muted flex-1">결제 기한이 지나 자동 만료된 예약입니다.</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="black-bg" onClick={() => setSelected(null)} />
                </>
            )}

            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
