"use client";
import { useEffect, useState } from "react";

// 사이드메뉴 항목 옆에 붙는 숫자 뱃지 - endpoint가 { count: number }를 반환한다고 가정
export default function CountBadge({ endpoint }: { endpoint: string }) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        fetch(endpoint)
            .then((res) => res.json())
            .then(({ count }) => setCount(count ?? 0))
            .catch(() => {});
    }, [endpoint]);

    if (count === 0) return null;

    return (
        <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold leading-none">
            {count > 99 ? '99+' : count}
        </span>
    );
}
