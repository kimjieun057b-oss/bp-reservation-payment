import { useCallback, useRef, useState } from "react";

interface UseCreateOptions {
    onSuccess?: (result: any) => void;
    onError?: (message: string) => void;
}

export function useCreate<TPayload extends Record<string, any> | FormData = Record<string, any>>(
    baseUrl: string,
    options: UseCreateOptions = {}
) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const create = useCallback(async (payload: TPayload) => {
        if (loading) return null;

        try {
            setLoading(true);
            setError(null);

            const isFormData = payload instanceof FormData;

            const response = await fetch(baseUrl, {
                method: "POST",
                headers: isFormData ? undefined : { "Content-Type": "application/json" },
                body: isFormData ? payload : JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "등록에 실패했습니다.");
            }

            optionsRef.current.onSuccess?.(result);
            return result;

        } catch (err: any) {
            const message = err.message || "서버 내부 오류가 발생했습니다.";
            setError(message);
            optionsRef.current.onError?.(message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [baseUrl, loading]);

    return { create, loading, error, setError };
}
