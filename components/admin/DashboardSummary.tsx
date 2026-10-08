// FR-8 연장: 관리자가 예약관리에서 확인하기 어려운 "이번 달 매출/환불액/순매출"과 최근 추이를
// Dashboard(ERP 역할)에서만 집계해서 보여준다. 예약 건별 상세(취소 사유, 개별 환불액)는 예약관리 화면 책임.
// FR-10: 오늘/이번주 예약 수 카드는 클릭하면 그 건수를 구성한 예약 목록(예약관리, created_from/to 필터)으로
// 드릴다운해서, 숫자만 보고 끝나는 게 아니라 근거를 바로 확인할 수 있게 한다.
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";
import { formatWon } from "@/lib/formatCurrency";
import { formatDateOnly, formatLocalDate, formatLocalTime } from "@/lib/formatDate";

interface TrendPoint {
    month: string;
    revenue: number;
    refund: number;
    net: number;
}

interface PeriodCount {
    count: number;
    date_from: string;
    date_to: string;
}

interface NamedRef {
    name: string;
}

interface ScheduleRow {
    id: string;
    guest_name: string;
    guest_phone: string;
    guest_count: number;
    check_in: string;
    check_out: string;
    checked_in_at: string | null;
    checked_out_at: string | null;
    room_types: NamedRef | null;
    rooms: NamedRef | null;
}

interface PendingRow {
    id: string;
    guest_name: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    total_price: number;
    hold_expire_at: string | null;
    source: "ONLINE" | "PHONE";
    room_types: NamedRef | null;
    rooms: NamedRef | null;
}

interface UpcomingRow {
    id: string;
    guest_name: string;
    check_in: string;
    check_out: string;
    total_price: number;
    room_types: NamedRef | null;
    rooms: NamedRef | null;
}

interface CancelRow {
    id: string;
    guest_name: string;
    check_in: string;
    check_out: string;
    cancelled_at: string | null;
    refund_amount: number | null;
    cancel_reason: string | null;
    room_types: NamedRef | null;
}

interface NoShowRow {
    id: string;
    guest_name: string;
    guest_phone: string;
    check_in: string;
    check_out: string;
    total_price: number;
    room_types: NamedRef | null;
    rooms: NamedRef | null;
}

interface DashboardSummaryData {
    month: string;
    revenue: number;
    refund: number;
    net: number;
    trend: TrendPoint[];
    today: PeriodCount;
    thisWeek: PeriodCount;
    todaySchedule: {
        date: string;
        arrivals: ScheduleRow[];
        departures: ScheduleRow[];
    };
    pendingConfirmation: PendingRow[];
    upcoming7Days: {
        date_from: string;
        date_to: string;
        count: number;
        items: UpcomingRow[];
    };
    recentCancellations: CancelRow[];
    noShowSuspects: NoShowRow[];
}

const roomLabel = (roomType: NamedRef | null, room: NamedRef | null) =>
    `${roomType?.name ?? "-"}${room?.name ? ` (${room.name})` : ""}`;

const currentMonthValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (month: string) => `${Number(month.slice(5, 7))}월`;

async function loadSummary(month: string): Promise<DashboardSummaryData> {
    const response = await fetch(`/api/admin/dashboard/summary?month=${month}`);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "대시보드 요약을 불러오지 못했습니다.");
    }

    return result;
}

export default function DashboardSummary() {
    const [month, setMonth] = useState(currentMonthValue);
    const [data, setData] = useState<DashboardSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchSummary = useCallback(async (target: string) => {
        setLoading(true);
        try {
            const summary = await loadSummary(target);
            setError(null);
            setData(summary);
        } catch (err) {
            setError(err instanceof Error ? err.message : "대시보드 요약을 불러오지 못했습니다.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSummary(month)
            .then((summary) => {
                setError(null);
                setData(summary);
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "대시보드 요약을 불러오지 못했습니다.");
                setData(null);
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onChangeMonth = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            if (!value) return;
            setMonth(value);
            fetchSummary(value);
        },
        [fetchSummary]
    );

    const confirmNoShow = useCallback(
        async (row: NoShowRow) => {
            if (!window.confirm(`${row.guest_name}님 예약을 노쇼로 확정할까요? 환불 없이 취소 처리됩니다.`)) {
                return;
            }

            setProcessingId(row.id);
            try {
                const response = await fetch(`/api/admin/reservations/${row.id}/cancel`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: "NO_SHOW", refund_amount: 0 }),
                });
                const result = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(result?.message || "노쇼 확정 처리에 실패했습니다.");
                }

                await fetchSummary(month);
                setToast("노쇼로 확정 처리되었습니다.");
            } catch (err) {
                setToast(err instanceof Error ? err.message : "노쇼 확정 처리에 실패했습니다.");
            } finally {
                setProcessingId(null);
            }
        },
        [fetchSummary, month]
    );

    const confirmPending = useCallback(
        async (row: PendingRow) => {
            if (!window.confirm(`${row.guest_name}님 전화 예약을 확정할까요? 계좌이체 확인이 끝난 경우에만 진행하세요.`)) {
                return;
            }

            setProcessingId(row.id);
            try {
                const response = await fetch(`/api/admin/reservations/${row.id}/confirm`, { method: "PATCH" });
                const result = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(result?.message || "확정 처리에 실패했습니다.");
                }

                await fetchSummary(month);
                setToast("전화 예약이 확정 처리되었습니다.");
            } catch (err) {
                setToast(err instanceof Error ? err.message : "확정 처리에 실패했습니다.");
            } finally {
                setProcessingId(null);
            }
        },
        [fetchSummary, month]
    );

    const maxTrendValue = useMemo(() => {
        if (!data) return 0;
        return Math.max(1, ...data.trend.map((t) => Math.max(t.revenue, t.refund)));
    }, [data]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <label htmlFor="dashboard-month" className="form-label">조회 월</label>
                    <input
                        type="month"
                        id="dashboard-month"
                        value={month}
                        onChange={onChangeMonth}
                        className="form-input"
                    />
                </div>
                <Link href="/admin/phone-reservations" className="btn-primary">전화 예약 입력</Link>
            </div>

            {loading ? (
                <Loading contents="매출 요약을 불러오는 중입니다..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : data ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Link
                            href={`/admin/reservations?created_from=${data.today.date_from}&created_to=${data.today.date_to}`}
                            className="card p-6 block hover:opacity-80 transition-opacity"
                        >
                            <p className="text-sm text-muted mb-2">오늘 예약 수</p>
                            <p className="text-2xl font-bold text-title">{data.today.count.toLocaleString()}건</p>
                        </Link>
                        <Link
                            href={`/admin/reservations?created_from=${data.thisWeek.date_from}&created_to=${data.thisWeek.date_to}`}
                            className="card p-6 block hover:opacity-80 transition-opacity"
                        >
                            <p className="text-sm text-muted mb-2">이번주 예약 수</p>
                            <p className="text-2xl font-bold text-title">{data.thisWeek.count.toLocaleString()}건</p>
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <Link href="/admin/checkinout" className="card p-6 block hover:opacity-80 transition-opacity">
                            <p className="text-sm text-muted mb-2">오늘 체크인·체크아웃</p>
                            <p className="text-2xl font-bold text-title">
                                {data.todaySchedule.arrivals.length}건 · {data.todaySchedule.departures.length}건
                            </p>
                        </Link>
                        <Link
                            href="/admin/reservations?status=HOLD"
                            className="card p-6 block hover:opacity-80 transition-opacity"
                        >
                            <p className="text-sm text-muted mb-2">확정 대기</p>
                            <p className="text-2xl font-bold text-title">{data.pendingConfirmation.length.toLocaleString()}건</p>
                        </Link>
                        <Link
                            href={`/admin/reservations?date_from=${data.upcoming7Days.date_from}&date_to=${data.upcoming7Days.date_to}`}
                            className="card p-6 block hover:opacity-80 transition-opacity"
                        >
                            <p className="text-sm text-muted mb-2">다가오는 7일</p>
                            <p className="text-2xl font-bold text-title">{data.upcoming7Days.count.toLocaleString()}건</p>
                        </Link>
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">노쇼 의심</p>
                            <p className="text-2xl font-bold text-title">{data.noShowSuspects.length.toLocaleString()}건</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-medium text-title">오늘 일정 ({data.todaySchedule.date})</p>
                                <Link href="/admin/checkinout" className="text-xs text-primary hover:underline">전체보기 →</Link>
                            </div>
                            {data.todaySchedule.arrivals.length + data.todaySchedule.departures.length === 0 ? (
                                <p className="text-sm text-muted text-center py-4">오늘 일정이 없습니다.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {data.todaySchedule.arrivals.map((row) => (
                                        <li key={`arrival-${row.id}`} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                                            <div>
                                                <span className="badge badge-muted mr-2">체크인</span>
                                                <span className="font-medium text-title">{row.guest_name}</span>
                                                <span className="text-muted ml-1">{roomLabel(row.room_types, row.rooms)}</span>
                                            </div>
                                            {row.checked_in_at ? (
                                                <span className="badge badge-success">완료 {formatLocalTime(row.checked_in_at)}</span>
                                            ) : (
                                                <span className="badge badge-warning">예정</span>
                                            )}
                                        </li>
                                    ))}
                                    {data.todaySchedule.departures.map((row) => (
                                        <li key={`departure-${row.id}`} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                                            <div>
                                                <span className="badge badge-muted mr-2">체크아웃</span>
                                                <span className="font-medium text-title">{row.guest_name}</span>
                                                <span className="text-muted ml-1">{roomLabel(row.room_types, row.rooms)}</span>
                                            </div>
                                            {row.checked_out_at ? (
                                                <span className="badge badge-success">완료 {formatLocalTime(row.checked_out_at)}</span>
                                            ) : (
                                                <span className="badge badge-warning">예정</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-medium text-title">확정 대기</p>
                                <Link href="/admin/reservations?status=HOLD" className="text-xs text-primary hover:underline">전체보기 →</Link>
                            </div>
                            {data.pendingConfirmation.length === 0 ? (
                                <p className="text-sm text-muted text-center py-4">확정 대기 중인 예약이 없습니다.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {data.pendingConfirmation.map((row) => (
                                        <li key={row.id} className="py-2.5 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-title">
                                                    {row.guest_name}
                                                    {row.source === "PHONE" && (
                                                        <span className="badge badge-info ml-2">전화</span>
                                                    )}
                                                </span>
                                                <span className="text-title">{formatWon(row.total_price)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-xs text-muted mt-0.5">
                                                <span>
                                                    {roomLabel(row.room_types, row.rooms)} · {formatDateOnly(row.check_in)}~{formatDateOnly(row.check_out)}
                                                </span>
                                                {row.hold_expire_at && (
                                                    <span>{formatLocalTime(row.hold_expire_at)} 만료</span>
                                                )}
                                            </div>
                                            {row.source === "PHONE" && (
                                                <div className="flex justify-end mt-1">
                                                    <button
                                                        type="button"
                                                        className="btn-ghost"
                                                        disabled={processingId === row.id}
                                                        onClick={() => confirmPending(row)}
                                                    >
                                                        확정 처리
                                                    </button>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-medium text-title">
                                    다가오는 7일 ({data.upcoming7Days.date_from} ~ {data.upcoming7Days.date_to})
                                </p>
                                <Link
                                    href={`/admin/reservations?date_from=${data.upcoming7Days.date_from}&date_to=${data.upcoming7Days.date_to}`}
                                    className="text-xs text-primary hover:underline"
                                >
                                    전체보기 →
                                </Link>
                            </div>
                            {data.upcoming7Days.items.length === 0 ? (
                                <p className="text-sm text-muted text-center py-4">다가오는 7일간 예약이 없습니다.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {data.upcoming7Days.items.map((row) => (
                                        <li key={row.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                                            <div>
                                                <span className="font-medium text-title">{row.guest_name}</span>
                                                <span className="text-muted ml-1">{roomLabel(row.room_types, row.rooms)}</span>
                                            </div>
                                            <div className="text-right text-xs text-muted">
                                                <p className="text-sm text-title">{formatDateOnly(row.check_in)}</p>
                                                <p>{formatWon(row.total_price)}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="card p-6">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-sm font-medium text-title">최근 취소/환불</p>
                                <Link href="/admin/reservations?status=CANCELLED" className="text-xs text-primary hover:underline">전체보기 →</Link>
                            </div>
                            {data.recentCancellations.length === 0 ? (
                                <p className="text-sm text-muted text-center py-4">최근 취소/환불 내역이 없습니다.</p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {data.recentCancellations.map((row) => (
                                        <li key={row.id} className="py-2.5 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-title">{row.guest_name}</span>
                                                <span className="text-red-600">{formatWon(row.refund_amount ?? 0)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-xs text-muted mt-0.5">
                                                <span>
                                                    {roomLabel(row.room_types, null)}
                                                    {row.cancel_reason ? ` · ${row.cancel_reason}` : ""}
                                                </span>
                                                {row.cancelled_at && <span>{formatLocalDate(row.cancelled_at)}</span>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-medium text-title">노쇼 의심</p>
                            <p className="text-xs text-muted">체크인일 자정이 지나도록 체크인 처리가 없는 확정 예약입니다.</p>
                        </div>
                        {data.noShowSuspects.length === 0 ? (
                            <p className="text-sm text-muted text-center py-4">노쇼 의심 건이 없습니다.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {data.noShowSuspects.map((row) => (
                                    <li key={row.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                                        <div>
                                            <span className="font-medium text-title">{row.guest_name}</span>
                                            <span className="text-muted ml-1">{row.guest_phone}</span>
                                            <span className="text-muted ml-1">
                                                · {roomLabel(row.room_types, row.rooms)} · {formatDateOnly(row.check_in)}~{formatDateOnly(row.check_out)} · {formatWon(row.total_price)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn-ghost"
                                            disabled={processingId === row.id}
                                            onClick={() => confirmNoShow(row)}
                                        >
                                            노쇼 확정
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">매출</p>
                            <p className="text-2xl font-bold text-title">{formatWon(data.revenue)}</p>
                        </div>
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">환불액</p>
                            <p className="text-2xl font-bold text-red-600">{formatWon(data.refund)}</p>
                        </div>
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">순매출</p>
                            <p className="text-2xl font-bold text-title">{formatWon(data.net)}</p>
                        </div>
                    </div>

                    <div className="card p-6">
                        <p className="text-sm font-medium text-title mb-6">최근 6개월 추이</p>
                        <div className="flex items-end justify-between gap-3 h-48">
                            {data.trend.map((t) => (
                                <div key={t.month} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                                    <div className="flex-1 w-full flex items-end justify-center gap-1">
                                        <div
                                            className="w-1/2 max-w-6 rounded-t bg-primary"
                                            style={{ height: `${(t.revenue / maxTrendValue) * 100}%` }}
                                            title={`매출 ${formatWon(t.revenue)}`}
                                        />
                                        <div
                                            className="w-1/2 max-w-6 rounded-t bg-red-300"
                                            style={{ height: `${(t.refund / maxTrendValue) * 100}%` }}
                                            title={`환불 ${formatWon(t.refund)}`}
                                        />
                                    </div>
                                    <p className="text-xs text-muted">{monthLabel(t.month)}</p>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-4 mt-4 text-xs text-muted">
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-primary" /> 매출
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-sm bg-red-300" /> 환불
                            </span>
                        </div>
                    </div>
                </>
            ) : null}

            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
