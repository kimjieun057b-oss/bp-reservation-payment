import { useCallback, useEffect, useRef, useState } from "react";

interface UseUpdateOptions {
    onSuccess?: (result: unknown) => void;
    onError?: (message: string) => void;
}

export function useUpdate<TPayload extends Record<string, unknown> | FormData = Record<string, unknown>>(
    baseUrl: string,
    options: UseUpdateOptions = {}
) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const optionsRef = useRef(options);
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    const update = useCallback(async (id: string | number, payload: TPayload) => {
        if (loading) return null;

        try {
            setLoading(true);
            setError(null);

            const isFormData = payload instanceof FormData;

            const response = await fetch(`${baseUrl}/${id}`, {
                method: "PATCH",
                headers: isFormData ? undefined : { "Content-Type": "application/json" },
                body: isFormData ? payload : JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || result.error || "수정에 실패했습니다.");
            }

            optionsRef.current.onSuccess?.(result);
            return result;

        } catch (err) {
            const message = err instanceof Error ? err.message : "서버 내부 오류가 발생했습니다.";
            setError(message);
            optionsRef.current.onError?.(message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [baseUrl, loading]);

    return { update, loading, error, setError };
}
