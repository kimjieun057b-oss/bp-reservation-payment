"use client";

import { formatWon } from "@/lib/formatCurrency";
import type { RoomTypeInfo } from "./types";

export interface StepRoomSelectProps {
    roomTypes: RoomTypeInfo[] | null;
    error: string | null;
    selectedId: string | null;
    locked: boolean;
    onSelect: (id: string) => void;
    onNext: () => void;
}

export default function StepRoomSelect({
    roomTypes,
    error,
    selectedId,
    locked,
    onSelect,
    onNext,
}: StepRoomSelectProps) {
    return (
        <div className="card p-6">
            <p className="text-lg font-bold text-title mb-1">01. 객실 선택</p>
            <p className="text-sm text-muted mb-6">
                {locked ? "객실안내에서 선택하신 객실입니다." : "예약하실 객실을 선택해주세요."}
            </p>

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
            {!roomTypes && !error && <p className="text-sm text-muted">불러오는 중...</p>}

            <div className="grid gap-3 pc:grid-cols-2 mb-8">
                {roomTypes?.map((rt) => {
                    const selected = rt.id === selectedId;
                    const disabled = locked && !selected;

                    return (
                        <button
                            key={rt.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => !locked && onSelect(rt.id)}
                            className={`text-left rounded-lg border p-4 transition-colors
                                ${selected ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary"}
                                ${disabled ? "opacity-40 cursor-not-allowed hover:border-gray-200" : "cursor-pointer"}`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-title font-bold">{rt.name}</p>
                                {selected && <span className="text-primary">✓</span>}
                            </div>
                            <p className="text-xs text-muted mb-2">
                                기준 {rt.capacity_standard}인 · 최대 {rt.capacity_max}인
                            </p>
                            <p className="text-sm text-primary font-bold">{formatWon(rt.base_price)}~</p>
                        </button>
                    );
                })}
            </div>

            <div className="flex justify-end">
                <button type="button" onClick={onNext} disabled={!selectedId} className="btn-primary px-8">
                    다음 단계
                </button>
            </div>
        </div>
    );
}
