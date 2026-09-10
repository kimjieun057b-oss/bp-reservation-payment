"use client";
import { ADMIN_CATEGORY } from "@/datas/categories";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 대시보드 아이콘 (그리드)
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

// 예약 관리 아이콘 (캘린더)
function ReservationsIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1.5 6H14.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4.5 1.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11.5 1.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

// 객실 관리 아이콘 (침대)
function RoomTypesIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M1.5 12.5V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M1.5 12.5H14.5V9.5C14.5 8.39543 13.6046 7.5 12.5 7.5H1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1.5 7.5V5.5C1.5 4.94772 1.94772 4.5 2.5 4.5H6.5C7.05228 4.5 7.5 4.94772 7.5 5.5V7.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14.5 12.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

const ADMIN_NAV_ICONS: { [key: string]: () => React.ReactElement } = {
    dashboard: DashboardIcon,
    reservations: ReservationsIcon,
    room_types: RoomTypesIcon,
};

export default function SideMenu() {
    const pathname = usePathname();

    return (
        <aside className="admin-sidebar w-56 shrink-0 min-h-screen">
            <nav className="py-4">
                <ul>
                    {Object.entries(ADMIN_CATEGORY).map(([key, value]) => {
                        const href = `/admin/${key}`;
                        const active = pathname === href || pathname.startsWith(`${href}/`);
                        const Icon = ADMIN_NAV_ICONS[key];
                        return (
                            <li key={key}>
                                <Link
                                    href={href}
                                    className={`admin-nav-link ${active ? "admin-nav-link-active" : ""}`}
                                >
                                    {Icon && <Icon />}
                                    {value.title}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </aside>
    );
}
