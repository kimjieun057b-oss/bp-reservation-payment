"use client";
import { ADMIN_CATEGORY } from "@/datas/categories";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 대시보드 아이콘 (그리드) - ADMIN_CATEGORY에는 없는 상단 고정 메뉴라 여기서 직접 링크한다.
function DashboardIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
    );
}

export default function SideMenu() {
    const pathname = usePathname();

    return (
        <aside className="admin-sidebar w-56 shrink-0 min-h-screen">
            <nav className="py-4">
                <ul>
                    <li>
                        <Link
                            href="/admin"
                            className={`admin-nav-link ${pathname === "/admin" ? "admin-nav-link-active" : ""}`}
                        >
                            <DashboardIcon />
                            대시보드
                        </Link>
                    </li>
                </ul>

                <ul className="space-y-1">
                    {Object.entries(ADMIN_CATEGORY).map(([key, value]) => {
                        return (
                            <li key={key}>
                                <p className="admin-nav-section-title">
                                    {value.title}
                                </p>
                                {value.categories && (
                                    <ul className="space-y-0.5">
                                        {value.categories.map((sub) => {
                                            const href = `/admin/${key}/${sub.url}`;
                                            const active = pathname === href || pathname.startsWith(`${href}/`);
                                            return (
                                                <li key={sub.url}>
                                                    <Link
                                                        href={href}
                                                        className={`admin-nav-sublink ${active ? "admin-nav-sublink-active" : ""}`}
                                                    >
                                                        <span className="flex-1 truncate">{sub.name}</span>
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </aside>
    );
}
