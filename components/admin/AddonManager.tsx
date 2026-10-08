// 옵션 상품(addons) CRUD. 예약 시 고객이 선택하는 부가상품(온수풀/바베큐 등)을 관리한다.
// property 전체 공통이라 RoomTypeManager와 달리 하위 목록(RoomList/PriceRuleList 같은) 없이 평면 목록이다.
"use client";
import { useCallback, useState } from "react";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useCreate } from "@/hooks/useCreate";
import { useUpdate } from "@/hooks/useUpdate";
import { useDelete } from "@/hooks/useDelete";
import { formatWon } from "@/lib/formatCurrency";

interface Addon {
    id: string;
    name: string;
    description: string | null;
    price: number;
    is_active: boolean;
}

interface FormState {
    name: string;
    description: string;
    price: string;
}

const EMPTY_FORM: FormState = {
    name: "",
    description: "",
    price: "",
};

function toFormState(addon: Addon): FormState {
    return {
        name: addon.name,
        description: addon.description ?? "",
        price: String(addon.price),
    };
}

export default function AddonManager() {
    const { data, loading, error, refetch } = useFetch<{ addons: Addon[] }>("/api/admin/addons");
    const addons = data?.addons ?? [];

    const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const { create, loading: creating } = useCreate("/api/admin/addons", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { update, loading: updating } = useUpdate("/api/admin/addons", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { remove } = useDelete("/api/admin/addons", {
        onSuccess: () => {
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

    const openEditModal = useCallback((addon: Addon) => {
        setForm(toFormState(addon));
        setFormError(null);
        setModalMode("edit");
        setEditingId(addon.id);
    }, []);

    const closeModal = useCallback(() => {
        setModalMode(null);
        setEditingId(null);
    }, []);

    const toggleActive = useCallback(
        async (addon: Addon) => {
            const result = await update(addon.id, { is_active: !addon.is_active });
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
                price: Number(form.price),
            };

            if (!payload.name) {
                setFormError("옵션 상품 이름을 입력해 주세요.");
                return;
            }
            if (!Number.isFinite(payload.price) || payload.price < 0) {
                setFormError("가격을 올바르게 입력해 주세요.");
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
                    + 옵션 상품 등록
                </button>
            </div>

            {loading ? (
                <Loading contents="옵션 상품 목록을 불러오는 중입니다..." />
            ) : error ? (
                <p className="card p-6 text-sm text-center text-muted">{error}</p>
            ) : addons.length === 0 ? (
                <p className="card p-6 text-sm text-center text-muted">등록된 옵션 상품이 없습니다.</p>
            ) : (
                <div className="card overflow-x-auto">
                    <table>
                        <thead>
                            <tr>
                                <th>이름</th>
                                <th>설명</th>
                                <th>가격</th>
                                <th>상태</th>
                                <th>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {addons.map((addon) => (
                                <tr key={addon.id}>
                                    <td className="font-medium text-title">{addon.name}</td>
                                    <td className="text-muted">{addon.description || "-"}</td>
                                    <td>{formatWon(addon.price)}</td>
                                    <td>
                                        <span className={`badge ${addon.is_active ? "badge-success" : "badge-muted"}`}>
                                            {addon.is_active ? "판매중" : "비활성"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex gap-1.5 flex-wrap">
                                            <button type="button" onClick={() => openEditModal(addon)} className="btn-ghost">
                                                수정
                                            </button>
                                            <button type="button" onClick={() => toggleActive(addon)} className="btn-ghost">
                                                {addon.is_active ? "비활성화" : "활성화"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmDeleteId(addon.id)}
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

            {modalMode && (
                <>
                    <form
                        onSubmit={onSubmit}
                        className="card fixed top-1/2 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto"
                    >
                        <div className="px-6 pt-6 pb-5 space-y-3">
                            <p className="font-bold text-title mb-1">
                                {modalMode === "edit" ? "옵션 상품 수정" : "옵션 상품 등록"}
                            </p>
                            <div>
                                <label className="form-label">이름</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="예: 온수풀 이용권"
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
                            <div>
                                <label className="form-label">가격(원)</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="form-input"
                                    value={form.price}
                                    onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                                />
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
                vaild={confirmDeleteId ? "이 옵션 상품을 삭제할까요?" : null}
                setVaild={() => setConfirmDeleteId(null)}
                onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
            />
            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
