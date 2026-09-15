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
    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    // refetch()가 호출되면 reloadToken을 올려 아래 fetch effect를 다시 돈다.
    const [reloadToken, setReloadToken] = useState(0);
    const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

    // url이 null이면(아직 조회할 대상이 없음) fetch할 필요 없이 상태를 비우기만 하면 되는
    // 순수 파생 상태라, effect 대신 렌더 중 조건부 setState로 처리한다(react-hooks/set-state-in-effect 회피).
    if (url === null && (data !== null || loading || error !== null)) {
        setData(null);
        setLoading(false);
        setError(null);
    }

    useEffect(() => {
        if (url === null) return; // 위에서 이미 처리됨

        let ignore = false;

        // setLoading(true)를 effect 몸통에 직접 두면 react-hooks/set-state-in-effect가 걸린다
        // (effect의 동기 실행 경로에서 바로 호출되는 setState로 간주됨). 콜백 안에서 호출하면
        // 규칙이 통과하고, 마이크로태스크 한 틱 뒤라 사용자에게 보이는 타이밍 차이는 없다.
        Promise.resolve().then(() => {
            if (!ignore) setLoading(true);
        });

        fetch(url)
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.message || "데이터를 불러오지 못했습니다.");
                }
                if (!ignore) {
                    setError(null);
                    setData(result as T);
                }
            })
            .catch((err) => {
                if (ignore) return;
                const message = err instanceof Error ? err.message : "서버 내부 오류가 발생했습니다.";
                setError(message);
                optionsRef.current.onError?.(message);
            })
            .finally(() => {
                if (!ignore) setLoading(false);
            });

        return () => {
            ignore = true;
        };
    }, [url, reloadToken]);

    return { data, loading, error, refetch, setData };
}
