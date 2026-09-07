"use client";
import { useCallback, useState } from "react";

export default function LogoutButton() {
    const [loading, setLoading] = useState(false);

    const onLogout = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        await fetch('/api/login/logout', { method: 'POST' });
        window.location.href = '/login';
    }, [loading]);

    return (
        <button
            onClick={onLogout}
            disabled={loading}
            className="text-sm font-medium text-body hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
        >
            {loading ? "로그아웃 중..." : "로그아웃"}
        </button>
    );
}
