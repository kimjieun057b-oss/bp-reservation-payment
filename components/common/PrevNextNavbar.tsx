import Link from "next/link";

interface NavItem {
    href: string;
    title: string;
}

interface PrevNextNavbarProps {
    prevItem?: NavItem | null;
    nextItem?: NavItem | null;
    prevLabel?: string;
    nextLabel?: string;
}

export default function PrevNextNavbar({
    prevItem,
    nextItem,
    prevLabel = "이전 글",
    nextLabel = "다음 글",
}: PrevNextNavbarProps) {
    return (
        <div className="mt-6 border-t border-gray-100">

            {/* 다음 */}
            <div className="border-b border-gray-100">
                {nextItem ? (
                    <Link
                        href={nextItem.href}
                        className="flex items-center gap-6 px-2 py-4 hover:bg-surface transition-colors"
                    >
                        <span className="w-20 shrink-0 text-sm font-bold text-primary">{nextLabel}</span>
                        <span className="text-sm text-body truncate">{nextItem.title}</span>
                    </Link>
                ) : (
                    <div className="flex items-center gap-6 px-2 py-4">
                        <span className="w-20 shrink-0 text-sm font-bold text-primary">{nextLabel}</span>
                        <span className="text-sm text-muted">다음 글이 없습니다.</span>
                    </div>
                )}
            </div>
            {/* 이전 */}
            <div className="border-b border-gray-100">
                {prevItem ? (
                    <Link
                        href={prevItem.href}
                        className="flex items-center gap-6 px-2 py-4 hover:bg-surface transition-colors"
                    >
                        <span className="w-20 shrink-0 text-sm font-bold text-primary">{prevLabel}</span>
                        <span className="text-sm text-body truncate">{prevItem.title}</span>
                    </Link>
                ) : (
                    <div className="flex items-center gap-6 px-2 py-4">
                        <span className="w-20 shrink-0 text-sm font-bold text-primary">{prevLabel}</span>
                        <span className="text-sm text-muted">이전 글이 없습니다.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
