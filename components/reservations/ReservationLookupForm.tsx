"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import Toast from "@/components/ui/Toast";

type ReservationStatus = "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";

interface ReservationResult {
    id: string;
    check_in: string;
    check_out: string;
    guest_count: number;
    status: ReservationStatus;
    total_price: number;
    hold_expire_at: string | null;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
    properties: { name: string } | null;
}

interface LookupFormState {
    guest_name: string;
    guest_phone: string;
}

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

const formatDate = (value: string) => value.replaceAll("-", ".");

export default function ReservationLookupForm() {
    const [form, setForm] = useState<LookupFormState>({ guest_name: "", guest_phone: "" });
    const [loading, setLoading] = useState<boolean>(false);
    const [vaild, setVaild] = useState<string | null>(null);
    const [results, setResults] = useState<ReservationResult[] | null>(null);

    const onChangeForm = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    }, []);

    const onSubmitForm = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;

        if (!form.guest_name.trim()) {
            setVaild("예약자명을 입력해주세요.");
            return;
        }

        if (!form.guest_phone.trim()) {
            setVaild("전화번호를 입력해주세요.");
            return;
        }

        try {
            setLoading(true);
            const response = await fetch("/api/reservations/lookup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "예약 조회에 실패했습니다.");
            }

            setResults(result.reservations);

            if (result.reservations.length === 0) {
                setVaild("일치하는 예약 내역이 없습니다. 예약자명과 전화번호를 다시 확인해 주세요.");
            }
        } catch (err: any) {
            setVaild(err.message);
            setResults(null);
        } finally {
            setLoading(false);
        }
    }, [form, loading]);

    return (
        <>
            <form onSubmit={onSubmitForm} className="card p-6 space-y-4 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="guest_name" className="form-label">예약자명</label>
                        <input
                            type="text"
                            id="guest_name"
                            name="guest_name"
                            placeholder="예약 시 입력한 이름"
                            onChange={onChangeForm}
                            value={form.guest_name}
                            className="form-input"
                        />
                    </div>
                    <div>
                        <label htmlFor="guest_phone" className="form-label">전화번호</label>
                        <input
                            type="tel"
                            id="guest_phone"
                            name="guest_phone"
                            placeholder="예약 시 입력한 전화번호"
                            onChange={onChangeForm}
                            value={form.guest_phone}
                            className="form-input"
                        />
                    </div>
                </div>
                <button type="submit" className="btn-primary w-full sm:w-auto" disabled={loading}>
                    {loading ? "조회 중..." : "예약 조회"}
                </button>
            </form>

            {results && results.length > 0 && (
                <ul className="mt-6 space-y-4">
                    {results.map((r) => (
                        <li key={r.id} className="card p-6 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                                <span className="text-xs text-muted">예약번호 {r.id.slice(0, 8)}</span>
                            </div>
                            <div>
                                <p className="font-bold text-title">
                                    {r.properties?.name} · {r.room_types?.name}
                                    {r.rooms?.name ? ` (${r.rooms.name})` : ""}
                                </p>
                                <p className="text-sm text-body mt-1">
                                    {formatDate(r.check_in)} ~ {formatDate(r.check_out)} · 인원 {r.guest_count}명
                                </p>
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                <span className="text-sm text-body">결제 금액</span>
                                <span className="font-bold text-title">{r.total_price.toLocaleString()}원</span>
                            </div>
                            {r.status === "HOLD" && (
                                <Link href={`/checkout/${r.id}`} className="btn-primary w-full text-center block">
                                    결제 진행하기
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <Toast vaild={vaild} setVaild={setVaild} />
        </>
    );
}
