// FR-9 AC1/AC2: 선택된 객실 타입에 속한 개별 유닛(rooms) CRUD + 점검(비활성화) 처리.
"use client";
import { useCallback, useMemo, useState } from "react";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useCreate } from "@/hooks/useCreate";
import { useUpdate } from "@/hooks/useUpdate";
import { useDelete } from "@/hooks/useDelete";

interface Room {
    id: string;
    room_type_id: string;
    name: string;
    is_active: boolean;
    blocked_from: string | null;
    blocked_until: string | null;
    is_occupied: boolean;
}

interface RoomListProps {
    roomTypeId: string;
    // 유닛 추가/삭제 시 상위 목록의 "재고" 개수도 갱신해야 하므로 부모에 알려준다.
    onRoomCountChanged?: () => void;
}

function statusOf(room: Room): { label: string; badge: string } {
    if (!room.is_active) return { label: "비활성", badge: "badge-muted" };
    if (room.blocked_from) return { label: "점검중", badge: "badge-warning" };
    return { label: "정상", badge: "badge-success" };
}

export default function RoomList({ roomTypeId, onRoomCountChanged }: RoomListProps) {
    const url = useMemo(() => `/api/admin/rooms?room_type_id=${roomTypeId}`, [roomTypeId]);
    const { data, loading, error, refetch } = useFetch<{ rooms: Room[] }>(url);
    const rooms = data?.rooms ?? [];

    const [newName, setNewName] = useState("");
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [blockModalRoom, setBlockModalRoom] = useState<Room | null>(null);
    const [blockedFrom, setBlockedFrom] = useState("");
    const [blockedUntil, setBlockedUntil] = useState("");
    const [toast, setToast] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const { create, loading: creating } = useCreate("/api/admin/rooms", {
        onSuccess: () => {
            setNewName("");
            refetch();
            onRoomCountChanged?.();
        },
        onError: (message) => setToast(message),
    });

    const { update } = useUpdate("/api/admin/rooms", {
        onSuccess: () => refetch(),
        onError: (message) => setToast(message),
    });

    const { remove } = useDelete("/api/admin/rooms", {
        onSuccess: () => {
            setConfirmDeleteId(null);
            refetch();
            onRoomCountChanged?.();
        },
        onError: (message) => {
            setConfirmDeleteId(null);
            setToast(message);
        },
    });

    const onAddRoom = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) {
                setToast("객실 이름을 입력해 주세요.");
                return;
            }
            create({ room_type_id: roomTypeId, name });
        },
        [newName, roomTypeId, create]
    );

    const startRename = useCallback((room: Room) => {
        setRenamingId(room.id);
        setRenameValue(room.name);
    }, []);

    const submitRename = useCallback(
        async (id: string) => {
            const name = renameValue.trim();
            if (!name) {
                setToast("객실 이름을 입력해 주세요.");
                return;
            }
            const result = await update(id, { name });
            if (result) setRenamingId(null);
        },
        [renameValue, update]
    );

    const toggleActive = useCallback(
        async (room: Room) => {
            await update(room.id, { is_active: !room.is_active });
        },
        [update]
    );

    const openBlockModal = useCallback((room: Room) => {
        setBlockModalRoom(room);
        setBlockedFrom(room.blocked_from ?? "");
        setBlockedUntil(room.blocked_until ?? "");
    }, []);

    const submitBlock = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (!blockModalRoom) return;
            if (!blockedFrom) {
                setToast("점검 시작일을 선택해 주세요.");
                return;
            }
            const result = await update(blockModalRoom.id, {
                blocked_from: blockedFrom,
                blocked_until: blockedUntil || null,
            });
            if (result) setBlockModalRoom(null);
        },
        [blockModalRoom, blockedFrom, blockedUntil, update]
    );

    const clearBlock = useCallback(async () => {
        if (!blockModalRoom) return;
        const result = await update(blockModalRoom.id, { blocked_from: null, blocked_until: null });
        if (result) setBlockModalRoom(null);
    }, [blockModalRoom, update]);

    return (
        <div className="card p-5 space-y-4">
            <p className="font-bold text-title">객실 유닛</p>

            <form onSubmit={onAddRoom} className="flex gap-2">
                <input
                    className="form-input flex-1"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="예: 101호"
                />
                <button type="submit" disabled={creating} className="btn-primary shrink-0">
                    추가
                </button>
            </form>

            {loading ? (
                <Loading contents="불러오는 중..." />
            ) : error ? (
                <p className="text-sm text-muted">{error}</p>
            ) : rooms.length === 0 ? (
                <p className="text-sm text-muted">등록된 유닛이 없습니다.</p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {rooms.map((room) => {
                        const status = statusOf(room);
                        return (
                            <li key={room.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                                <div className="min-w-0">
                                    {renamingId === room.id ? (
                                        <div className="flex gap-1.5">
                                            <input
                                                className="form-input"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                autoFocus
                                            />
                                            <button type="button" className="btn-ghost" onClick={() => submitRename(room.id)}>
                                                저장
                                            </button>
                                            <button type="button" className="btn-ghost" onClick={() => setRenamingId(null)}>
                                                취소
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-medium text-title flex items-center gap-2">
                                                {room.name}
                                                <span className={`badge ${status.badge}`}>{status.label}</span>
                                                {room.is_occupied && <span className="badge badge-accent">사용중</span>}
                                            </p>
                                            {room.blocked_from && (
                                                <p className="text-xs text-muted mt-0.5">
                                                    점검: {room.blocked_from} ~ {room.blocked_until ?? "무기한"}
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                                {renamingId !== room.id && (
                                    <div className="flex gap-1.5 flex-wrap">
                                        <button type="button" className="btn-ghost" onClick={() => startRename(room)}>
                                            이름변경
                                        </button>
                                        <button type="button" className="btn-ghost" onClick={() => openBlockModal(room)}>
                                            점검설정
                                        </button>
                                        <button type="button" className="btn-ghost" onClick={() => toggleActive(room)}>
                                            {room.is_active ? "비활성화" : "활성화"}
                                        </button>
                                        <button type="button" className="btn-danger" onClick={() => setConfirmDeleteId(room.id)}>
                                            삭제
                                        </button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {blockModalRoom && (
                <>
                    <form
                        onSubmit={submitBlock}
                        className="card fixed top-1/2 left-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2"
                    >
                        <div className="px-6 pt-6 pb-5 space-y-3">
                            <p className="font-bold text-title mb-1">{blockModalRoom.name} 점검 설정</p>
                            <p className="text-xs text-muted pb-3 mb-1 border-b border-gray-100">
                                시작일 이후(종료일 지정 시 그 날짜까지) 신규 예약을 받지 않습니다.
                            </p>
                            <div>
                                <label className="form-label">점검 시작일</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={blockedFrom}
                                    onChange={(e) => setBlockedFrom(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="form-label">점검 종료일 (비우면 무기한)</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={blockedUntil}
                                    onChange={(e) => setBlockedUntil(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-center gap-3 pt-2">
                                <button type="button" className="btn-ghost flex-1" onClick={() => setBlockModalRoom(null)}>
                                    닫기
                                </button>
                                {blockModalRoom.blocked_from && (
                                    <button type="button" className="btn-ghost flex-1" onClick={clearBlock}>
                                        점검 해제
                                    </button>
                                )}
                                <button type="submit" className="btn-primary flex-1">
                                    저장
                                </button>
                            </div>
                        </div>
                    </form>
                    <div className="black-bg" />
                </>
            )}

            <Toast
                vaild={confirmDeleteId ? "이 객실 유닛을 삭제할까요?" : null}
                setVaild={() => setConfirmDeleteId(null)}
                onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
            />
            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
