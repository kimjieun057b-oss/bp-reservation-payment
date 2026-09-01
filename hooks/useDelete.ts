import { useCallback, useRef, useState } from "react";

interface UseDeleteOptions {
    onSuccess?: () => void;
    onError?: (message: string) => void;
}

interface RemoveOptions {
    queryParams?: Record<string, string>;
    body?: Record<string, any>;
}

export function useDelete(baseUrl: string, options: UseDeleteOptions = {}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const remove = useCallback(async (id: string | number, removeOptions?: RemoveOptions) => {
        if (loading) return false;

        try {
            setLoading(true);
            setError(null);

            const query = removeOptions?.queryParams
                ? '?' + new URLSearchParams(removeOptions.queryParams).toString()
                : '';

            const body = removeOptions?.body;

            const response = await fetch(`${baseUrl}/${id}${query}`, {
                method: "DELETE",
                ...(body ? {
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                } : {}),
            });

            if (!response.ok) {
                const result = await response.json().catch(() => null);
                throw new Error(result?.error || "삭제에 실패했습니다.");
            }

            optionsRef.current.onSuccess?.();
            return true;

        } catch (err: any) {
            const message = err.message || "서버 내부 오류가 발생했습니다.";
            setError(message);
            optionsRef.current.onError?.(message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [baseUrl, loading]);

    return { remove, loading, error, setError };
}
