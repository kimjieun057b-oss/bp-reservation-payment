// FR-9 AC1: 객실 타입 CRUD. 목록에서 타입을 선택하면 아래에 그 타입의 유닛(RoomList)과
// 요금 정책(PriceRuleList)을 이어서 보여준다 (계층 구조를 한 화면에서 관리).
"use client";
import { useCallback, useState } from "react";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useCreate } from "@/hooks/useCreate";
import { useUpdate } from "@/hooks/useUpdate";
import { useDelete } from "@/hooks/useDelete";
import RoomList from "@/components/admin/RoomList";
import PriceRuleList from "@/components/admin/PriceRuleList";

interface RoomType {
    id: string;
    name: string;
    description: string | null;
    capacity_standard: number;
    capacity_max: number;
    base_price: number;
    extra_person_fee: number;
    is_active: boolean;
    room_count: number;
}

interface FormState {
    name: string;
    description: string;
    capacity_standard: string;
    capacity_max: string;
    base_price: string;
    extra_person_fee: string;
}

const EMPTY_FORM: FormState = {
    name: "",
    description: "",
    capacity_standard: "2",
    capacity_max: "4",
    base_price: "",
    extra_person_fee: "0",
};

function toFormState(roomType: RoomType): FormState {
    return {
        name: roomType.name,
        description: roomType.description ?? "",
        capacity_standard: String(roomType.capacity_standard),
        capacity_max: String(roomType.capacity_max),
        base_price: String(roomType.base_price),
        extra_person_fee: String(roomType.extra_person_fee),
    };
}

export default function RoomTypeManager() {
    const { data, loading, error, refetch } = useFetch<{ room_types: RoomType[] }>("/api/admin/room-types");
    const roomTypes = data?.room_types ?? [];

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const { create, loading: creating } = useCreate("/api/admin/room-types", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { update, loading: updating } = useUpdate("/api/admin/room-types", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { remove } = useDelete("/api/admin/room-types", {
        onSuccess: () => {
            if (selectedId === confirmDeleteId) setSelectedId(null);
            setConfirmDeleteId(null);
            refetch();
        },
        onError: (message) => {
            setConfirmDeleteId(null);
            setToast(message);
        },
    });

    const openCreateModal = useCallback(() => {
        setForm(EMPTY_FORM);
        setFormError(null);
        setModalMode("create");
        setEditingId(null);
    }, []);

    const openEditModal = useCallback((roomType: RoomType) => {
        setForm(toFormState(roomType));
        setFormError(null);
        setModalMode("edit");
        setEditingId(roomType.id);
    }, []);

    const closeModal = useCallback(() => {
        setModalMode(null);
        setEditingId(null);
    }, []);

    const toggleActive = useCallback(
        async (roomType: RoomType) => {
            const result = await update(roomType.id, { is_active: !roomType.is_active });
            if (result) refetch();
        },
        [update, refetch]
    );

    const onSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setFormError(null);

            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || null,
                capacity_standard: Number(form.capacity_standard),
                capacity_max: Number(form.capacity_max),
                base_price: Number(form.base_price),
                extra_person_fee: Number(form.extra_person_fee),
            };

            if (!payload.name) {
                setFormError("객실 타입 이름을 입력해 주세요.");
                return;
            }
            if (!Number.isFinite(payload.base_price) || payload.base_price < 0) {
                setFormError("기준가를 올바르게 입력해 주세요.");
                return;
            }

            if (modalMode === "edit" && editingId) {
                update(editingId, payload);
            } else {
                create(payload);
            }
        },
        [form, modalMode, editingId, create, update]
    );

    const submitting = creating || updating;

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <button type="button" onClick={openCreateModal} className="btn-primary">
                    + 객실 타입 등록
                </button>
            </div>

            {loading ? (
                <Loading contents="객실 타입 목록을 불러오는 중입니다..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : roomTypes.length === 0 ? (
                <p className="card p-6 text-sm text-center text-muted">등록된 객실 타입이 없습니다.</p>
            ) : (
                <div className="card overflow-x-auto">
                    <table>
                        <thead>
                            <tr>
                                <th>이름</th>
                                <th>기준/최대 인원</th>
                                <th>기준가</th>
                                <th>인원추가요금</th>
                                <th>재고</th>
                                <th>상태</th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roomTypes.map((rt) => (
                                <tr
                                    key={rt.id}
                                    onClick={() => setSelectedId(rt.id === selectedId ? null : rt.id)}
                                    className={`cursor-pointer ${selectedId === rt.id ? "bg-surface" : ""}`}
                                >
                                    <td className="font-medium text-title">{rt.name}</td>
                                    <td>{rt.capacity_standard}인 / {rt.capacity_max}인</td>
                                    <td>{rt.base_price.toLocaleString()}원</td>
                                    <td>{rt.extra_person_fee.toLocaleString()}원</td>
                                    <td>
                                        {rt.room_count === 0 ? (
                                            <span className="badge badge-danger">객실없음</span>
                                        ) : (
                                            `${rt.room_count}개`
                                        )}
                                    </td>
                                    <td>
                                        <span className={`badge ${rt.is_active ? "badge-success" : "badge-muted"}`}>
                                            {rt.is_active ? "판매중" : "비활성"}
                                        </span>
                                    </td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <div className="flex gap-1.5 flex-wrap">
                                            <button type="button" onClick={() => openEditModal(rt)} className="btn-ghost">
                                                수정
                                            </button>
                                            <button type="button" onClick={() => toggleActive(rt)} className="btn-ghost">
                                                {rt.is_active ? "비활성화" : "활성화"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteId(rt.id)}
                                                className="btn-danger"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedId && (
                <div className="grid gap-6 pc:grid-cols-2">
                    <RoomList roomTypeId={selectedId} onRoomCountChanged={refetch} />
                    <PriceRuleList roomTypeId={selectedId} />
                </div>
            )}

            {modalMode && (
                <>
                    <form
                        onSubmit={onSubmit}
                        className="card fixed top-1/2 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto"
                    >
                        <div className="px-6 pt-6 pb-5 space-y-3">
                            <p className="font-bold text-title mb-1">
                                {modalMode === "edit" ? "객실 타입 수정" : "객실 타입 등록"}
                            </p>
                            <div>
                                <label className="form-label">이름</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="예: 디럭스 온돌룸"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="form-label">설명 (선택)</label>
                                <textarea
                                    className="form-input"
                                    rows={2}
                                    value={form.description}
                                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="form-label">기준 인원</label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="form-input"
                                        value={form.capacity_standard}
                                        onChange={(e) => setForm((prev) => ({ ...prev, capacity_standard: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">최대 인원</label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="form-input"
                                        value={form.capacity_max}
                                        onChange={(e) => setForm((prev) => ({ ...prev, capacity_max: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="form-label">기준가(원)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="form-input"
                                        value={form.base_price}
                                        onChange={(e) => setForm((prev) => ({ ...prev, base_price: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">인원추가요금(원)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="form-input"
                                        value={form.extra_person_fee}
                                        onChange={(e) => setForm((prev) => ({ ...prev, extra_person_fee: e.target.value }))}
                                    />
                                </div>
                            </div>
                            {formError && <p className="text-xs text-red-600">{formError}</p>}
                            <div className="flex justify-center gap-3 pt-2">
                                <button type="button" onClick={closeModal} disabled={submitting} className="btn-ghost flex-1">
                                    취소
                                </button>
                                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                                    {submitting ? "처리 중..." : modalMode === "edit" ? "수정" : "등록"}
                                </button>
                            </div>
                        </div>
                    </form>
                    <div className="black-bg" />
                </>
            )}

            <Toast
                vaild={confirmDeleteId ? "이 객실 타입을 삭제할까요? 소속된 유닛/요금 정책도 함께 삭제됩니다." : null}
                setVaild={() => setConfirmDeleteId(null)}
                onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
            />
            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
