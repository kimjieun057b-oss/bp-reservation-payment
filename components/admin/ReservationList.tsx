// FR-8 AC1/AC2: 관리자 예약 목록 조회(상태/기간별) + 강제 취소.
// 목록 조회는 설계문서 4-2 "GET /admin/reservations?status=&date_from=&date_to="를 그대로 사용한다(백엔드는 별도 작업).
// 강제 취소는 이미 구현된 PATCH /api/admin/reservations/:id/cancel을 그대로 재사용한다.
"use client";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Loading from "@/components/ui/Loading";
import Pagination from "@/components/ui/Pagination";
import Toast from "@/components/ui/Toast";
import { usePagination } from "@/hooks/usePagination";
import type { ReservationStatus } from "@/lib/reservations/types";

interface AdminReservationRow {
    id: string;
    guest_name: string;
    guest_phone: string;
    guest_count: number;
    check_in: string;
    check_out: string;
    status: ReservationStatus;
    total_price: number;
    refund_amount: number | null;
    created_at: string;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
    properties: { name: string } | null;
}

interface FilterState {
    status: ReservationStatus | "ALL";
    date_from: string;
    date_to: string;
}

const ITEMS_PER_PAGE = 20;

const DEFAULT_FILTERS: FilterState = { status: "ALL", date_from: "", date_to: "" };

const STATUS_LABEL: Record<ReservationStatus, string> = {
    HOLD: "결제 대기",
    CONFIRMED: "예약 확정",
    CANCELLED: "취소됨",
    EXPIRED: "기간 만료",
};

const STATUS_BADGE: Record<ReservationStatus, string> = {
    HOLD: "badge-warning",
    CONFIRMED: "badge-success",
    CANCELLED: "badge-muted",
    EXPIRED: "badge-danger",
};

const formatDate = (value: string) => value.slice(0, 10).replaceAll("-", ".");

// created_at은 시간이 포함된 timestamptz라 문자열을 그대로 자르면(formatDate) UTC 기준 날짜가 나와
// 로컬 자정 근처에서 하루가 어긋날 수 있다. Date 객체의 로컬 getter로 변환해 날짜만 뽑는다.
const formatCreatedAt = (value: string) => {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
};

// 상태를 만지지 않는 순수 조회 함수. 이펙트 안에서는 이 함수를 그대로 호출하지 않고
// .then/.catch 콜백 안에서만 setState를 호출해야 "이펙트 내 동기 setState" 린트를 피할 수 있다.
async function loadReservationRows(filters: FilterState): Promise<AdminReservationRow[]> {
    const params = new URLSearchParams();
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);

    const response = await fetch(`/api/admin/reservations?${params.toString()}`);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "예약 목록을 불러오지 못했습니다.");
    }

    return result.reservations ?? [];
}

export default function ReservationList() {
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [keyword, setKeyword] = useState("");
    const [rows, setRows] = useState<AdminReservationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [vaild, setVaild] = useState<string | null>(null);
    const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // 재조회(필터 제출/초기화)에서 쓰는 버전 - 이펙트 밖의 이벤트 핸들러이므로 자유롭게 setState할 수 있다.
    const fetchReservations = useCallback(async (target: FilterState) => {
        setLoading(true);
        try {
            const reservations = await loadReservationRows(target);
            setError(null);
            setRows(reservations);
        } catch (err) {
            setError(err instanceof Error ? err.message : "예약 목록을 불러오지 못했습니다.");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // 최초 마운트 조회는 setState를 .then/.catch/.finally 콜백 안에서만 호출해
    // "이펙트 내 동기 setState" 린트(react-hooks/set-state-in-effect)를 피한다.
    useEffect(() => {
        loadReservationRows(DEFAULT_FILTERS)
            .then((reservations) => {
                setError(null);
                setRows(reservations);
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "예약 목록을 불러오지 못했습니다.");
                setRows([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const onSubmitFilters = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            fetchReservations(filters);
        },
        [filters, fetchReservations]
    );

    const onResetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
        setKeyword("");
        fetchReservations(DEFAULT_FILTERS);
    }, [fetchReservations]);

    // 서버 조회 결과(상태/기간) 안에서 예약자명·전화번호·예약번호로 한 번 더 좁혀본다.
    const filteredRows = useMemo(() => {
        const trimmed = keyword.trim();
        if (!trimmed) return rows;
        return rows.filter(
            (r) => r.guest_name.includes(trimmed) || r.guest_phone.includes(trimmed) || r.id.startsWith(trimmed)
        );
    }, [rows, keyword]);

    const { currentItems, totalCount, onPageChange } = usePagination(filteredRows, ITEMS_PER_PAGE);

    const closeToast: Dispatch<SetStateAction<string | null>> = useCallback((value) => {
        setVaild(value);
        setCancelTargetId(null);
    }, []);

    const requestCancel = useCallback((id: string) => {
        setCancelTargetId(id);
        setVaild("예약을 강제 취소하시겠습니까? 환불 규정에 따라 환불 금액이 자동 계산됩니다.");
    }, []);

    const performCancel = useCallback(async (id: string) => {
        setCancellingId(id);
        try {
            const response = await fetch(`/api/admin/reservations/${id}/cancel`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "관리자 강제 취소" }),
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "취소 처리에 실패했습니다.");
            }

            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? { ...r, status: "CANCELLED" as ReservationStatus, refund_amount: result.refundAmount }
                        : r
                )
            );
            setVaild(
                result.refundAmount > 0
                    ? `취소 처리되었습니다. ${result.refundAmount.toLocaleString()}원이 환불됩니다.`
                    : "취소 처리되었습니다. 환불 규정상 환불 금액은 없습니다."
            );
        } catch (err) {
            setVaild(err instanceof Error ? err.message : "취소 처리에 실패했습니다.");
        } finally {
            setCancellingId(null);
        }
    }, []);

    return (
        <div className="space-y-4">
            <form onSubmit={onSubmitFilters} className="card p-4 flex flex-wrap items-end gap-3">
                <div>
                    <label htmlFor="status" className="form-label">상태</label>
                    <select
                        id="status"
                        value={filters.status}
                        onChange={(e) =>
                            setFilters((prev) => ({ ...prev, status: e.target.value as FilterState["status"] }))
                        }
                        className="form-input"
                    >
                        <option value="ALL">전체</option>
                        <option value="HOLD">결제 대기</option>
                        <option value="CONFIRMED">예약 확정</option>
                        <option value="CANCELLED">취소됨</option>
                        <option value="EXPIRED">기간 만료</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="date_from" className="form-label">체크인(부터)</label>
                    <input
                        type="date"
                        id="date_from"
                        value={filters.date_from}
                        onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
                        className="form-input"
                    />
                </div>
                <div>
                    <label htmlFor="date_to" className="form-label">체크인(까지)</label>
                    <input
                        type="date"
                        id="date_to"
                        value={filters.date_to}
                        onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
                        className="form-input"
                    />
                </div>
                <div className="flex-1 min-w-40">
                    <label htmlFor="keyword" className="form-label">예약자명/전화번호</label>
                    <input
                        type="text"
                        id="keyword"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="조회된 목록 내에서 검색"
                        className="form-input"
                    />
                </div>
                <div className="flex gap-2">
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? "조회 중..." : "조회"}
                    </button>
                    <button type="button" onClick={onResetFilters} className="btn-ghost" disabled={loading}>
                        초기화
                    </button>
                </div>
            </form>

            {loading ? (
                <Loading contents="예약 목록을 불러오는 중입니다..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : filteredRows.length === 0 ? (
                <p className="card p-6 text-sm text-center text-muted">조건에 맞는 예약이 없습니다.</p>
            ) : (
                <>
                    <div className="card overflow-x-auto">
                        <table>
                            <thead>
                                <tr>
                                    <th>예약번호</th>
                                    <th>예약자</th>
                                    <th>객실</th>
                                    <th>체크인~체크아웃</th>
                                    <th>인원</th>
                                    <th>금액</th>
                                    <th>상태</th>
                                    <th>관리</th>
                                    <th>예약일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentItems.map((r) => (
                                    <tr key={r.id}>
                                        <td className="text-muted">{r.id.slice(0, 8)}</td>
                                        <td>
                                            <p className="font-medium text-title">{r.guest_name}</p>
                                            <p className="text-xs text-muted">{r.guest_phone}</p>
                                        </td>
                                        <td>
                                            {r.room_types?.name}
                                            {r.rooms?.name ? ` (${r.rooms.name})` : ""}
                                        </td>
                                        <td className="whitespace-nowrap">
                                            {formatDate(r.check_in)} ~ {formatDate(r.check_out)}
                                        </td>
                                        <td>{r.guest_count}명</td>
                                        <td className="font-medium text-title">
                                            {r.total_price.toLocaleString()}원
                                        </td>
                                        <td>
                                            <span className={`badge ${STATUS_BADGE[r.status]}`}>
                                                {STATUS_LABEL[r.status]}
                                            </span>
                                        </td>
                                        <td>
                                            {(r.status === "CONFIRMED" || r.status === "HOLD") && (
                                                <button
                                                    type="button"
                                                    onClick={() => requestCancel(r.id)}
                                                    disabled={cancellingId === r.id}
                                                    className="btn-danger"
                                                >
                                                    {cancellingId === r.id ? "처리 중..." : "강제 취소"}
                                                </button>
                                            )}
                                        </td>
                                        <td className="text-muted whitespace-nowrap">{formatCreatedAt(r.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <Pagination totalCount={totalCount} itemsPerPage={ITEMS_PER_PAGE} onPageChange={onPageChange} />
                </>
            )}

            <Toast
                vaild={vaild}
                setVaild={closeToast}
                onConfirm={cancelTargetId ? () => performCancel(cancelTargetId) : undefined}
            />
        </div>
    );
}
