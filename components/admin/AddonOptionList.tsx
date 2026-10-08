// 부가서비스/옵션(바베큐, 조식, 웰컴패키지 등) 카탈로그 CRUD + 활성화 토글.
// 객실 타입과 무관하게 숙소 전체에 공통으로 적용되는 목록이다(PriceRuleList.tsx의 모달 폼,
// RoomList.tsx의 활성화 토글 패턴을 그대로 따른다).
"use client";
import { useCallback, useState } from "react";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useCreate } from "@/hooks/useCreate";
import { useUpdate } from "@/hooks/useUpdate";
import { useDelete } from "@/hooks/useDelete";
import { formatWon } from "@/lib/formatCurrency";

interface AddonOption {
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

const EMPTY_FORM: FormState = { name: "", description: "", price: "" };

function toFormState(option: AddonOption): FormState {
    return { name: option.name, description: option.description ?? "", price: String(option.price) };
}

export default function AddonOptionList() {
    const { data, loading, error, refetch } = useFetch<{ addon_options: AddonOption[] }>("/api/admin/addon-options");
    const options = data?.addon_options ?? [];

    const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const { create, loading: creating } = useCreate("/api/admin/addon-options", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { update, loading: updating } = useUpdate("/api/admin/addon-options", {
        onSuccess: () => refetch(),
        onError: (message) => setToast(message),
    });

    const { remove } = useDelete("/api/admin/addon-options", {
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

    const openEditModal = useCallback((option: AddonOption) => {
        setForm(toFormState(option));
        setFormError(null);
        setModalMode("edit");
        setEditingId(option.id);
    }, []);

    const toggleActive = useCallback(
        (option: AddonOption) => {
            update(option.id, { is_active: !option.is_active });
        },
        [update]
    );

    const onSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setFormError(null);

            const name = form.name.trim();
            const price = Number(form.price);

            if (!name) {
                setFormError("옵션 이름을 입력해 주세요.");
                return;
            }
            if (!Number.isFinite(price) || price < 0) {
                setFormError("가격을 올바르게 입력해 주세요.");
                return;
            }

            const payload = { name, price, description: form.description.trim() || null };

            if (modalMode === "edit" && editingId) {
                update(editingId, payload).then((result) => {
                    if (result) setModalMode(null);
                });
            } else {
                create(payload);
            }
        },
        [form, modalMode, editingId, create, update]
    );

    const submitting = creating || updating;

    return (
        <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
                <p className="font-bold text-title">부가서비스/옵션</p>
                <button type="button" onClick={openCreateModal} className="btn-ghost">
                    + 옵션 추가
                </button>
            </div>

            {loading ? (
                <Loading contents="불러오는 중..." />
            ) : error ? (
                <p className="text-sm text-muted">{error}</p>
            ) : options.length === 0 ? (
                <p className="text-sm text-muted">등록된 옵션이 없습니다.</p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {options.map((option) => (
                        <li key={option.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                                <p className="font-medium text-title flex items-center gap-2">
                                    {option.name}
                                    <span className={`badge ${option.is_active ? "badge-success" : "badge-muted"}`}>
                                        {option.is_active ? "활성" : "비활성"}
                                    </span>
                                </p>
                                <p className="text-xs text-muted mt-0.5">
                                    {formatWon(option.price)}
                                    {option.description ? ` · ${option.description}` : ""}
                                </p>
                            </div>
                            <div className="flex gap-1.5">
                                <button type="button" className="btn-ghost" onClick={() => openEditModal(option)}>
                                    수정
                                </button>
                                <button type="button" className="btn-ghost" onClick={() => toggleActive(option)}>
                                    {option.is_active ? "비활성화" : "활성화"}
                                </button>
                                <button type="button" className="btn-danger" onClick={() => setConfirmDeleteId(option.id)}>
                                    삭제
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {modalMode && (
                <>
                    <form
                        onSubmit={onSubmit}
                        className="card fixed top-1/2 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 max-h-[85vh] overflow-y-auto"
                    >
                        <div className="px-6 pt-6 pb-5 space-y-3">
                            <p className="font-bold text-title mb-1">
                                {modalMode === "edit" ? "옵션 수정" : "옵션 등록"}
                            </p>
                            <div>
                                <label className="form-label">이름</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="예: 바베큐 세트"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="form-label">설명 (선택)</label>
                                <textarea
                                    rows={2}
                                    className="form-input"
                                    value={form.description}
                                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                    placeholder="예: 숯불/식기 포함, 1인분 기준"
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
                                <button
                                    type="button"
                                    onClick={() => setModalMode(null)}
                                    disabled={submitting}
                                    className="btn-ghost flex-1"
                                >
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
                vaild={confirmDeleteId ? "이 옵션을 삭제할까요?" : null}
                setVaild={() => setConfirmDeleteId(null)}
                onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
            />
            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
