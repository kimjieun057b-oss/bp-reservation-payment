"use client";

export interface StepIndicatorProps {
    currentStep: number; // 1-based
    labels: readonly string[];
    onStepClick?: (step: number) => void;
}

export default function StepIndicator({ currentStep, labels, onStepClick }: StepIndicatorProps) {
    return (
        <div className="flex items-start mb-10">
            {labels.map((label, i) => {
                const step = i + 1;
                const done = step < currentStep;
                const active = step === currentStep;
                const clickable = !!onStepClick && step < currentStep;

                return (
                    <div key={label} className={`flex items-center ${step < labels.length ? "flex-1" : ""}`}>
                        <button
                            type="button"
                            disabled={!clickable}
                            onClick={() => clickable && onStepClick?.(step)}
                            className="flex flex-col items-center gap-2 shrink-0"
                        >
                            <span
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                                    ${done ? "bg-primary text-white" : active ? "bg-title text-white" : "bg-surface text-muted"}
                                    ${clickable ? "cursor-pointer" : "cursor-default"}`}
                            >
                                {done ? "✓" : step}
                            </span>
                            <span
                                className={`text-xs whitespace-nowrap ${active ? "text-title font-medium" : "text-muted"}`}
                            >
                                {label}
                            </span>
                        </button>
                        {step < labels.length && (
                            <div className={`h-px flex-1 mx-2 mb-5 ${done ? "bg-primary" : "bg-gray-200"}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
