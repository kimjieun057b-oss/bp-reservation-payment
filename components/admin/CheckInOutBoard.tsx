// 프런트 데스크 전용 화면: 결제 완료(CONFIRMED)된 예약 중 오늘(또는 선택한 날짜) 체크인/체크아웃
// 대상만 뽑아 보여주고, 실제 처리 버튼을 제공한다. 예약관리(전체 이력 조회)와는 목적이 달라 페이지를 분리했다.
"use client";
import { useCallback, useEffect, useState } from "react";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";

interface BoardRow {
    id: string;
    guest_name: string;
    guest_phone: string;
    guest_count: number;
    check_in: string;
    check_out: string;
    checked_in_at: string | null;
    checked_out_at: string | null;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
}

interface BoardData {
    date: string;
    arrivals: BoardRow[];
    departures: BoardRow[];
}

const todayValue = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const formatDate = (value: string) => value.slice(0, 10).replaceAll("-", ".");

const formatTime = (value: string) => {
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

async function loadBoard(date: string): Promise<BoardData> {
    const response = await fetch(`/api/admin/checkinout?date=${date}`);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "체크인/체크아웃 목록을 불러오지 못했습니다.");
    }

    return result;
}

export default function CheckInOutBoard() {
    const [date, setDate] = useState(todayValue);
    const [data, setData] = useState<BoardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchBoard = useCallback(async (target: string) => {
        setLoading(true);
        try {
            const board = await loadBoard(target);
            setError(null);
            setData(board);
        } catch (err) {
            setError(err instanceof Error ? err.message : "체크인/체크아웃 목록을 불러오지 못했습니다.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBoard(todayValue())
            .then((board) => {
                setError(null);
                setData(board);
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "체크인/체크아웃 목록을 불러오지 못했습니다.");
                setData(null);
            })
            .finally(() => setLoading(false));
    }, []);

    const onChangeDate = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const value = e.target.value;
            if (!value) return;
            setDate(value);
            fetchBoard(value);
        },
        [fetchBoard]
    );

    const runAction = useCallback(
        async (id: string, action: "checkin" | "checkout", method: "PATCH" | "DELETE") => {
            setProcessingId(id);
            try {
                const response = await fetch(`/api/admin/reservations/${id}/${action}`, { method });
                const result = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(result?.message || "처리에 실패했습니다.");
                }

                await fetchBoard(date);
                setToast(
                    action === "checkin"
                        ? method === "PATCH"
                            ? "체크인 처리되었습니다."
                            : "체크인이 취소되었습니다."
                        : method === "PATCH"
                          ? "체크아웃 처리되었습니다."
                          : "체크아웃이 취소되었습니다."
                );
            } catch (err) {
                setToast(err instanceof Error ? err.message : "처리에 실패했습니다.");
            } finally {
                setProcessingId(null);
            }
        },
        [date, fetchBoard]
    );

    const renderRows = (rows: BoardRow[], kind: "arrival" | "departure") => {
        if (rows.length === 0) {
            return <p className="card p-6 text-sm text-center text-muted">대상 예약이 없습니다.</p>;
        }

        return (
            <div className="card overflow-x-auto">
                <table>
                    <thead>
                        <tr>
                            <th>예약자</th>
                            <th>객실</th>
                            <th>체크인~체크아웃</th>
                            <th>인원</th>
                            <th>상태</th>
                            <th>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const isProcessing = processingId === r.id;
                            return (
                                <tr key={r.id}>
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
                                    <td>
                                        {kind === "arrival" ? (
                                            r.checked_in_at ? (
                                                <span className="badge badge-success">
                                                    체크인 완료 ({formatTime(r.checked_in_at)})
                                                </span>
                                            ) : (
                                                <span className="badge badge-warning">체크인 전</span>
                                            )
                                        ) : r.checked_out_at ? (
                                            <span className="badge badge-success">
                                                체크아웃 완료 ({formatTime(r.checked_out_at)})
                                            </span>
                                        ) : r.checked_in_at ? (
                                            <span className="badge badge-warning">체크아웃 전</span>
                                        ) : (
                                            <span className="badge badge-muted">미체크인</span>
                                        )}
                                    </td>
                                    <td>
                                        {kind === "arrival" ? (
                                            r.checked_in_at ? (
                                                <button
                                                    type="button"
                                                    className="btn-ghost"
                                                    disabled={isProcessing}
                                                    onClick={() => runAction(r.id, "checkin", "DELETE")}
                                                >
                                                    체크인 취소
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="btn-primary"
                                                    disabled={isProcessing}
                                                    onClick={() => runAction(r.id, "checkin", "PATCH")}
                                                >
                                                    체크인 처리
                                                </button>
                                            )
                                        ) : r.checked_out_at ? (
                                            <button
                                                type="button"
                                                className="btn-ghost"
                                                disabled={isProcessing}
                                                onClick={() => runAction(r.id, "checkout", "DELETE")}
                                            >
                                                체크아웃 취소
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                disabled={isProcessing || !r.checked_in_at}
                                                title={r.checked_in_at ? undefined : "체크인 먼저 필요합니다."}
                                                onClick={() => runAction(r.id, "checkout", "PATCH")}
                                            >
                                                체크아웃 처리
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="card p-4 flex flex-wrap items-end gap-3">
                <div>
                    <label htmlFor="checkinout-date" className="form-label">날짜</label>
                    <input
                        type="date"
                        id="checkinout-date"
                        value={date}
                        onChange={onChangeDate}
                        className="form-input"
                    />
                </div>
                <button type="button" onClick={() => { setDate(todayValue()); fetchBoard(todayValue()); }} className="btn-ghost" disabled={loading}>
                    오늘로 이동
                </button>
            </div>

            {loading ? (
                <Loading contents="불러오는 중..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : data ? (
                <>
                    <section className="space-y-2">
                        <p className="font-bold text-title">체크인 예정 ({data.arrivals.length}건)</p>
                        {renderRows(data.arrivals, "arrival")}
                    </section>
                    <section className="space-y-2">
                        <p className="font-bold text-title">체크아웃 예정 ({data.departures.length}건)</p>
                        {renderRows(data.departures, "departure")}
                    </section>
                </>
            ) : null}

            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
