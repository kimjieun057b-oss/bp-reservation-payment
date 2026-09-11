import { useCallback, useEffect, useRef, useState } from "react";

interface UseFetchOptions {
    onError?: (message: string) => void;
}

// useCreate/useUpdate/useDelete와 짝을 이루는 목록 조회용 훅.
// url이 null이면 조회하지 않는다 (예: 상위 항목이 아직 선택 안 된 하위 목록).
export function useFetch<T>(url: string | null, options: UseFetchOptions = {}) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const refetch = useCallback(async () => {
        if (!url) {
            setData(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(url);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "데이터를 불러오지 못했습니다.");
            }

            setError(null);
            setData(result as T);
        } catch (err) {
            const message = err instanceof Error ? err.message : "서버 내부 오류가 발생했습니다.";
            setError(message);
            optionsRef.current.onError?.(message);
        } finally {
            setLoading(false);
        }
    }, [url]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { data, loading, error, refetch, setData };
}
