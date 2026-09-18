"use client";

import { formatWon } from "@/lib/formatCurrency";
import type { AddonInfo } from "./types";

export interface StepOptionSelectProps {
    addons: AddonInfo[] | null;
    quantities: Record<string, number>;
    onChange: (addonId: string, delta: number) => void;
    onBack: () => void;
    onNext: () => void;
}

export default function StepOptionSelect({ addons, quantities, onChange, onBack, onNext }: StepOptionSelectProps) {
    return (
        <div className="card p-6">
            <p className="text-lg font-bold text-title mb-1">03. 옵션 선택</p>
            <p className="text-sm text-muted mb-6">필요한 옵션 상품을 선택해주세요. (선택 사항)</p>

            {!addons && <p className="text-sm text-muted mb-8">불러오는 중...</p>}
            {addons && addons.length === 0 && (
                <p className="text-sm text-muted mb-8">현재 이용 가능한 옵션 상품이 없습니다.</p>
            )}

            {addons && addons.length > 0 && (
                <div className="grid gap-3 pc:grid-cols-2 mb-8">
                    {addons.map((addon) => {
                        const qty = quantities[addon.id] ?? 0;
                        return (
                            <div
                                key={addon.id}
                                className={`rounded-lg border p-4 transition-colors ${
                                    qty > 0 ? "border-primary bg-primary/5" : "border-gray-200"
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <div>
                                        <p className="text-title font-bold">{addon.name}</p>
                                        {addon.description && (
                                            <p className="text-xs text-muted mt-0.5">{addon.description}</p>
                                        )}
                                    </div>
                                    <p className="text-sm text-primary font-bold shrink-0">{formatWon(addon.price)}</p>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => onChange(addon.id, -1)}
                                        className="btn-ghost w-8 h-8 flex items-center justify-center"
                                        aria-label={`${addon.name} 수량 감소`}
                                    >
                                        -
                                    </button>
                                    <span className="w-6 text-center text-sm font-medium">{qty}</span>
                                    <button
                                        type="button"
                                        onClick={() => onChange(addon.id, 1)}
                                        className="btn-ghost w-8 h-8 flex items-center justify-center"
                                        aria-label={`${addon.name} 수량 증가`}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex justify-between">
                <button type="button" onClick={onBack} className="btn-ghost px-8">
                    이전
                </button>
                <button type="button" onClick={onNext} className="btn-primary px-8">
                    다음 단계
                </button>
            </div>
        </div>
    );
}
