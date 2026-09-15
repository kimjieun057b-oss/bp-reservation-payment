// FR-8 AC1/AC2: 관리자 예약 목록 조회(상태/기간별) + 강제 취소.
// 목록 조회는 설계문서 4-2 "GET /admin/reservations?status=&date_from=&date_to="를 그대로 사용한다(백엔드는 별도 작업).
// 강제 취소는 이미 구현된 PATCH /api/admin/reservations/:id/cancel을 그대로 재사용한다.
// created_from/created_to는 대시보드 "오늘/이번주 예약 수" 카드의 드릴다운 링크(?created_from=&created_to=)를
// 초기 필터로 반영하기 위한 것으로, URL 쿼리에 있을 때만 사용한다.
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Loading from "@/components/ui/Loading";
import Pagination from "@/components/ui/Pagination";
import Toast from "@/components/ui/Toast";
import { formatDateOnly, formatLocalDate } from "@/lib/formatDate";
import type { ReservationStatus } from "@/lib/reservations/types";
import { formatWon } from "@/lib/formatCurrency";

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
    cancel_reason: string | null;
    created_at: string;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
    properties: { name: string } | null;
}

interface FilterState {
    status: ReservationStatus | "ALL";
    date_from: string;
    date_to: string;
    created_from: string;
    created_to: string;
}

const ITEMS_PER_PAGE = 20;
const KEYWORD_DEBOUNCE_MS = 350;

const DEFAULT_FILTERS: FilterState = {
    status: "ALL",
    date_from: "",
    date_to: "",
    created_from: "",
    created_to: "",
};

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

// 상태를 만지지 않는 순수 조회 함수. 이펙트 안에서는 이 함수를 그대로 호출하지 않고
// .then/.catch 콜백 안에서만 setState를 호출해야 "이펙트 내 동기 setState" 린트를 피할 수 있다.
async function loadReservationRows(
    filters: FilterState,
    keyword: string,
    page: number
): Promise<{ reservations: AdminReservationRow[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.created_from) params.set("created_from", filters.created_from);
    if (filters.created_to) params.set("created_to", filters.created_to);
    if (keyword) params.set("keyword", keyword);
    params.set("page", String(page));
    params.set("page_size", String(ITEMS_PER_PAGE));

    const response = await fetch(`/api/admin/reservations?${params.toString()}`);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "예약 목록을 불러오지 못했습니다.");
    }

    return { reservations: result.reservations ?? [], total: result.total ?? 0 };
}

export default function ReservationList() {
    const searchParams = useSearchParams();
    // 대시보드 드릴다운(?created_from=&created_to=, ?status=)에서 넘어온 값을 초기 필터로 반영한다.
    const initialFilters = useMemo<FilterState>(() => {
        const statusParam = searchParams.get("status");
        const status = statusParam && statusParam in STATUS_LABEL ? (statusParam as ReservationStatus) : "ALL";
        return {
            status,
            date_from: searchParams.get("date_from") ?? "",
            date_to: searchParams.get("date_to") ?? "",
            created_from: searchParams.get("created_from") ?? "",
            created_to: searchParams.get("created_to") ?? "",
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [filters, setFilters] = useState<FilterState>(initialFilters);
    // appliedFilters: 마지막으로 "조회"를 누른(또는 초기화한) 시점의 필터. 페이지 이동/키워드 검색은
    // 폼에서 아직 편집 중인 filters가 아니라 이 값을 기준으로 재조회해야 화면과 쿼리가 어긋나지 않는다.
    const [appliedFilters, setAppliedFilters] = useState<FilterState>(initialFilters);
    const [keywordInput, setKeywordInput] = useState("");
    const [activeKeyword, setActiveKeyword] = useState("");
    // Pagination 컴포넌트는 현재 페이지를 내부 state로 들고 있어 부모에서 강제로 되돌릴 수 없다.
    // 필터/키워드가 바뀌어 1페이지로 리셋될 때 이 key를 바꿔 Pagination을 통째로 리마운트시킨다.
    const [paginationResetKey, setPaginationResetKey] = useState(0);
    const [rows, setRows] = useState<AdminReservationRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [vaild, setVaild] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    // 강제 취소 모달(사유 입력) - 어떤 예약을 취소하려는지(id)와 입력 중인 사유, 유효성 에러를 관리한다.
    const [cancelModalId, setCancelModalId] = useState<string | null>(null);
    const [cancelReasonInput, setCancelReasonInput] = useState("");
    const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);

    // 재조회(필터 제출/초기화/페이지 이동/키워드 검색)에서 쓰는 버전 - 이펙트 밖의 이벤트 핸들러나
    // 디바운스 타이머 콜백에서 호출되므로 자유롭게 setState할 수 있다.
    const fetchReservations = useCallback(async (target: FilterState, kw: string, targetPage: number) => {
        setLoading(true);
        try {
            const { reservations, total: totalCount } = await loadReservationRows(target, kw, targetPage);
            setError(null);
            setRows(reservations);
            setTotal(totalCount);
        } catch (err) {
            setError(err instanceof Error ? err.message : "예약 목록을 불러오지 못했습니다.");
            setRows([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, []);

    // 최초 마운트 조회는 setState를 .then/.catch/.finally 콜백 안에서만 호출해
    // "이펙트 내 동기 setState" 린트(react-hooks/set-state-in-effect)를 피한다.
    useEffect(() => {
        loadReservationRows(initialFilters, "", 1)
            .then(({ reservations, total: totalCount }) => {
                setError(null);
                setRows(reservations);
                setTotal(totalCount);
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "예약 목록을 불러오지 못했습니다.");
                setRows([]);
                setTotal(0);
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmitFilters = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setAppliedFilters(filters);
            setPaginationResetKey((k) => k + 1);
            fetchReservations(filters, activeKeyword, 1);
        },
        [filters, activeKeyword, fetchReservations]
    );

    const onResetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
        setAppliedFilters(DEFAULT_FILTERS);
        setKeywordInput("");
        setActiveKeyword("");
        setPaginationResetKey((k) => k + 1);
        fetchReservations(DEFAULT_FILTERS, "", 1);
    }, [fetchReservations]);

    // 예약자명/전화번호 검색을 타이핑마다 서버에 쏘지 않도록 debounce 후 재조회한다.
    // (예약번호 부분검색은 uuid 컬럼이라 서버 ilike로 옮길 수 없어 이번에 제외했다.)
    useEffect(() => {
        const trimmed = keywordInput.trim();
        if (trimmed === activeKeyword) return;

        const timer = setTimeout(() => {
            setActiveKeyword(trimmed);
            setPaginationResetKey((k) => k + 1);
            fetchReservations(appliedFilters, trimmed, 1);
        }, KEYWORD_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [keywordInput, activeKeyword, appliedFilters, fetchReservations]);

    const onPageChange = useCallback(
        (nextPage: number) => {
            fetchReservations(appliedFilters, activeKeyword, nextPage);
        },
        [appliedFilters, activeKeyword, fetchReservations]
    );

    const openCancelModal = useCallback((id: string) => {
        setCancelModalId(id);
        setCancelReasonInput("");
        setCancelReasonError(null);
    }, []);

    const closeCancelModal = useCallback(() => {
        setCancelModalId(null);
        setCancelReasonInput("");
        setCancelReasonError(null);
    }, []);

    const performCancel = useCallback(async (id: string, reason: string) => {
        setCancellingId(id);
        try {
            const response = await fetch(`/api/admin/reservations/${id}/cancel`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "취소 처리에 실패했습니다.");
            }

            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? {
                              ...r,
                              status: "CANCELLED" as ReservationStatus,
                              refund_amount: result.refundAmount,
                              cancel_reason: reason,
                          }
                        : r
                )
            );
            setCancelModalId(null);
            setCancelReasonInput("");
            setVaild(
                result.refundAmount > 0
                    ? `취소 처리되었습니다. ${formatWon(result.refundAmount)}이 환불됩니다.`
                    : "취소 처리되었습니다. 환불 규정상 환불 금액은 없습니다."
            );
        } catch (err) {
            setCancelReasonError(err instanceof Error ? err.message : "취소 처리에 실패했습니다.");
        } finally {
            setCancellingId(null);
        }
    }, []);

    const onSubmitCancel = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (!cancelModalId) return;

            const trimmed = cancelReasonInput.trim();
            if (!trimmed) {
                setCancelReasonError("취소 사유를 입력해주세요.");
                return;
            }

            performCancel(cancelModalId, trimmed);
        },
        [cancelModalId, cancelReasonInput, performCancel]
    );

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
                <div>
                    <label htmlFor="created_from" className="form-label">접수일(부터)</label>
                    <input
                        type="date"
                        id="created_from"
                        value={filters.created_from}
                        onChange={(e) => setFilters((prev) => ({ ...prev, created_from: e.target.value }))}
                        className="form-input"
                    />
                </div>
                <div>
                    <label htmlFor="created_to" className="form-label">접수일(까지)</label>
                    <input
                        type="date"
                        id="created_to"
                        value={filters.created_to}
                        onChange={(e) => setFilters((prev) => ({ ...prev, created_to: e.target.value }))}
                        className="form-input"
                    />
                </div>
                <div className="flex-1 min-w-40">
                    <label htmlFor="keyword" className="form-label">예약자명/전화번호</label>
                    <input
                        type="text"
                        id="keyword"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        placeholder="이름 또는 전화번호로 검색"
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
            ) : rows.length === 0 ? (
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
                                {rows.map((r) => (
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
                                            {formatDateOnly(r.check_in)} ~ {formatDateOnly(r.check_out)}
                                        </td>
                                        <td>{r.guest_count}명</td>
                                        <td className="font-medium text-title">
                                            {r.status === "CANCELLED" ? (
                                                <>
                                                    <p className="text-xs text-muted line-through">
                                                        {formatWon(r.total_price)}
                                                    </p>
                                                    <p className="whitespace-nowrap">
                                                        환불 {formatWon(r.refund_amount)}
                                                    </p>
                                                </>
                                            ) : (
                                                formatWon(r.total_price)
                                            )}
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
                                                    onClick={() => openCancelModal(r.id)}
                                                    disabled={cancellingId === r.id}
                                                    className="btn-danger"
                                                >
                                                    강제 취소
                                                </button>
                                            )}
                                            {r.status === "CANCELLED" && r.cancel_reason && (
                                                <button
                                                    type="button"
                                                    onClick={() => setVaild(`취소 사유: ${r.cancel_reason}`)}
                                                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-title transition-colors cursor-pointer"
                                                    aria-label="취소 사유 보기"
                                                    title="취소 사유 보기"
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                                                        <line x1="8" y1="7.2" x2="8" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                                        <circle cx="8" cy="5" r="0.9" fill="currentColor" />
                                                    </svg>
                                                </button>
                                            )}
                                        </td>
                                        <td className="text-muted whitespace-nowrap">{formatLocalDate(r.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        key={paginationResetKey}
                        totalCount={total}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={onPageChange}
                    />
                </>
            )}

            <Toast vaild={vaild} setVaild={setVaild} />

            {cancelModalId && (
                <>
                    <form
                        onSubmit={onSubmitCancel}
                        className="card fixed top-1/2 left-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2"
                    >
                        <div className="px-6 pt-6 pb-5">
                            <p className="font-bold text-title mb-1">예약 강제 취소</p>
                            <p className="text-sm text-muted pb-4 mb-4 border-b border-gray-100">
                                환불 규정에 따라 환불 금액이 자동 계산됩니다. 취소 사유를 입력해주세요.
                            </p>
                            <label htmlFor="cancel-reason" className="form-label">취소 사유</label>
                            <textarea
                                id="cancel-reason"
                                rows={3}
                                className="form-input"
                                value={cancelReasonInput}
                                onChange={(e) => {
                                    setCancelReasonInput(e.target.value);
                                    setCancelReasonError(null);
                                }}
                                placeholder="예: 고객 요청으로 인한 취소"
                                autoFocus
                            />
                            {cancelReasonError && (
                                <p className="text-xs text-red-600 mt-1.5">{cancelReasonError}</p>
                            )}
                            <div className="flex justify-center gap-3 pt-5">
                                <button
                                    type="button"
                                    onClick={closeCancelModal}
                                    disabled={cancellingId === cancelModalId}
                                    className="btn-ghost flex-1"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={cancellingId === cancelModalId}
                                    className="btn-primary flex-1"
                                >
                                    {cancellingId === cancelModalId ? "처리 중..." : "강제 취소"}
                                </button>
                            </div>
                        </div>
                    </form>
                    <div className="black-bg" />
                </>
            )}
        </div>
    );
}
