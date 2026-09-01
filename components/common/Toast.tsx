import { Dispatch, SetStateAction } from "react";

export interface ToastProps {
    vaild: string | null;
    setVaild: Dispatch<SetStateAction<string | null>>;
    onConfirm?: () => void;
}

export default function Toast({ vaild, setVaild, onConfirm }: ToastProps) {
    return (
        <>
            {vaild && (
                <div className="card fixed top-1/2 left-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2">
                    <div className="px-6 pt-6 pb-5">
                        <p className="text-sm text-body text-center pb-5 border-b border-gray-100">{vaild}</p>
                        {onConfirm ? (
                            <div className="flex justify-center gap-3 pt-5">
                                <button
                                    onClick={() => setVaild(null)}
                                    className="btn-ghost flex-1"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={() => { onConfirm(); setVaild(null); }}
                                    className="btn-primary flex-1"
                                >
                                    확인
                                </button>
                            </div>
                        ) : (
                            <div className="pt-5 text-center">
                                <button onClick={() => setVaild(null)} className="btn-primary px-8">
                                    확인
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {vaild && <div className="black-bg" />}
        </>
    );
}
