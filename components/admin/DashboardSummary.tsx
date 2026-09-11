// FR-8 연장: 관리자가 예약관리에서 확인하기 어려운 "이번 달 매출/환불액/순매출"과 최근 추이를
// Dashboard(ERP 역할)에서만 집계해서 보여준다. 예약 건별 상세(취소 사유, 개별 환불액)는 예약관리 화면 책임.
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Loading from "@/components/ui/Loading";

interface TrendPoint {
    month: string;
    revenue: number;
    refund: number;
    net: number;
}

interface DashboardSummaryData {
    month: string;
    revenue: number;
    refund: number;
    net: number;
    trend: TrendPoint[];
}

const won = (n: number) => `${n.toLocaleString()}원`;

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
            </div>

            {loading ? (
                <Loading contents="매출 요약을 불러오는 중입니다..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : data ? (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">매출</p>
                            <p className="text-2xl font-bold text-title">{won(data.revenue)}</p>
                        </div>
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">환불액</p>
                            <p className="text-2xl font-bold text-red-600">{won(data.refund)}</p>
                        </div>
                        <div className="card p-6">
                            <p className="text-sm text-muted mb-2">순매출</p>
                            <p className="text-2xl font-bold text-title">{won(data.net)}</p>
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
                                            title={`매출 ${won(t.revenue)}`}
                                        />
                                        <div
                                            className="w-1/2 max-w-6 rounded-t bg-red-300"
                                            style={{ height: `${(t.refund / maxTrendValue) * 100}%` }}
                                            title={`환불 ${won(t.refund)}`}
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
        </div>
    );
}
