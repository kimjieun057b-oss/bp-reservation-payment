// FR-9 AC1: 선택된 객실 타입의 요금 정책(price_rules, 기간형/요일형) CRUD.
"use client";
import { useCallback, useMemo, useState } from "react";
import Loading from "@/components/ui/Loading";
import Toast from "@/components/ui/Toast";
import { useFetch } from "@/hooks/useFetch";
import { useCreate } from "@/hooks/useCreate";
import { useUpdate } from "@/hooks/useUpdate";
import { useDelete } from "@/hooks/useDelete";

interface PriceRule {
    id: string;
    room_type_id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    days_of_week: number[] | null;
    price: number;
    priority: number;
}

interface PriceRuleListProps {
    roomTypeId: string;
}

type RuleType = "period" | "weekday";

interface FormState {
    name: string;
    price: string;
    priority: string;
    ruleType: RuleType;
    start_date: string;
    end_date: string;
    days_of_week: number[];
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const EMPTY_FORM: FormState = {
    name: "",
    price: "",
    priority: "0",
    ruleType: "period",
    start_date: "",
    end_date: "",
    days_of_week: [],
};

function toFormState(rule: PriceRule): FormState {
    return {
        name: rule.name,
        price: String(rule.price),
        priority: String(rule.priority),
        ruleType: rule.days_of_week ? "weekday" : "period",
        start_date: rule.start_date ?? "",
        end_date: rule.end_date ?? "",
        days_of_week: rule.days_of_week ?? [],
    };
}

function describeRule(rule: PriceRule): string {
    if (rule.days_of_week) return rule.days_of_week.map((d) => WEEKDAY_LABELS[d]).join("·");
    return `${rule.start_date} ~ ${rule.end_date}`;
}

export default function PriceRuleList({ roomTypeId }: PriceRuleListProps) {
    const url = useMemo(() => `/api/admin/price-rules?room_type_id=${roomTypeId}`, [roomTypeId]);
    const { data, loading, error, refetch } = useFetch<{ price_rules: PriceRule[] }>(url);
    const priceRules = data?.price_rules ?? [];

    const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const { create, loading: creating } = useCreate("/api/admin/price-rules", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { update, loading: updating } = useUpdate("/api/admin/price-rules", {
        onSuccess: () => {
            setModalMode(null);
            refetch();
        },
        onError: (message) => setFormError(message),
    });

    const { remove } = useDelete("/api/admin/price-rules", {
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

    const openEditModal = useCallback((rule: PriceRule) => {
        setForm(toFormState(rule));
        setFormError(null);
        setModalMode("edit");
        setEditingId(rule.id);
    }, []);

    const toggleWeekday = useCallback((day: number) => {
        setForm((prev) => ({
            ...prev,
            days_of_week: prev.days_of_week.includes(day)
                ? prev.days_of_week.filter((d) => d !== day)
                : [...prev.days_of_week, day].sort(),
        }));
    }, []);

    const onSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setFormError(null);

            const name = form.name.trim();
            const price = Number(form.price);
            const priority = Number(form.priority);

            if (!name) {
                setFormError("요금 정책 이름을 입력해 주세요.");
                return;
            }
            if (!Number.isFinite(price) || price < 0) {
                setFormError("가격을 올바르게 입력해 주세요.");
                return;
            }

            const payload: Record<string, unknown> =
                form.ruleType === "period"
                    ? { name, price, priority, start_date: form.start_date, end_date: form.end_date, days_of_week: null }
                    : { name, price, priority, days_of_week: form.days_of_week, start_date: null, end_date: null };

            if (form.ruleType === "period" && (!form.start_date || !form.end_date)) {
                setFormError("시작일과 종료일을 모두 선택해 주세요.");
                return;
            }
            if (form.ruleType === "weekday" && form.days_of_week.length === 0) {
                setFormError("요일을 하나 이상 선택해 주세요.");
                return;
            }

            if (modalMode === "edit" && editingId) {
                update(editingId, payload);
            } else {
                create({ ...payload, room_type_id: roomTypeId });
            }
        },
        [form, modalMode, editingId, roomTypeId, create, update]
    );

    const submitting = creating || updating;

    return (
        <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
                <p className="font-bold text-title">요금 정책</p>
                <button type="button" onClick={openCreateModal} className="btn-ghost">
                    + 정책 추가
                </button>
            </div>

            {loading ? (
                <Loading contents="불러오는 중..." />
            ) : error ? (
                <p className="text-sm text-muted">{error}</p>
            ) : priceRules.length === 0 ? (
                <p className="text-sm text-muted">등록된 요금 정책이 없습니다. (기준가가 적용됩니다)</p>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {priceRules.map((rule) => (
                        <li key={rule.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                                <p className="font-medium text-title">{rule.name}</p>
                                <p className="text-xs text-muted mt-0.5">
                                    {describeRule(rule)} · {rule.price.toLocaleString()}원 · 우선순위 {rule.priority}
                                </p>
                            </div>
                            <div className="flex gap-1.5">
                                <button type="button" className="btn-ghost" onClick={() => openEditModal(rule)}>
                                    수정
                                </button>
                                <button type="button" className="btn-danger" onClick={() => setConfirmDeleteId(rule.id)}>
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
                                {modalMode === "edit" ? "요금 정책 수정" : "요금 정책 등록"}
                            </p>
                            <div>
                                <label className="form-label">이름</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="예: 여름 성수기"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-4 text-sm">
                                <label className="flex items-center gap-1.5">
                                    <input
                                        type="radio"
                                        checked={form.ruleType === "period"}
                                        onChange={() => setForm((prev) => ({ ...prev, ruleType: "period" }))}
                                    />
                                    특정 기간
                                </label>
                                <label className="flex items-center gap-1.5">
                                    <input
                                        type="radio"
                                        checked={form.ruleType === "weekday"}
                                        onChange={() => setForm((prev) => ({ ...prev, ruleType: "weekday" }))}
                                    />
                                    요일
                                </label>
                            </div>

                            {form.ruleType === "period" ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="form-label">시작일</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={form.start_date}
                                            onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">종료일</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={form.end_date}
                                            onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="form-label">요일 선택</label>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {WEEKDAY_LABELS.map((label, day) => (
                                            <button
                                                type="button"
                                                key={day}
                                                onClick={() => toggleWeekday(day)}
                                                className={`w-9 h-9 rounded-lg text-sm border transition-colors cursor-pointer ${
                                                    form.days_of_week.includes(day)
                                                        ? "bg-primary text-white border-primary"
                                                        : "border-gray-200 text-body"
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
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
                                <div>
                                    <label className="form-label">우선순위</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.priority}
                                        onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                                    />
                                </div>
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
                vaild={confirmDeleteId ? "이 요금 정책을 삭제할까요?" : null}
                setVaild={() => setConfirmDeleteId(null)}
                onConfirm={() => confirmDeleteId && remove(confirmDeleteId)}
            />
            <Toast vaild={toast} setVaild={setToast} />
        </div>
    );
}
