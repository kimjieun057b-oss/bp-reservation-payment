import Link from "next/link";

interface NavItem {
    href: string;
    title: string;
}

interface PrevNextNavbar2Props {
    prevItem?: NavItem | null;
    nextItem?: NavItem | null;
    prevLabel?: string;
    nextLabel?: string;
}

export default function PrevNextNavbar2({
    prevItem,
    nextItem,
    prevLabel = "이전 글",
    nextLabel = "다음 글",
}: PrevNextNavbar2Props) {
    return (
        <div className="flex gap-4">
            {/* 이전글 */}
            {prevItem ?
            <Link
                href={prevItem.href}
                className="group flex-1 card p-5 flex flex-col gap-3 hover:border-primary transition-colors"
            >
                <span className="text-sm text-muted group-hover:text-primary transition-colors">
                    {prevLabel}
                </span>
                <p className="text-title text-sm truncate group-hover:text-primary transition-colors">
                   {prevItem.title}
                </p>
                <span className="text-body text-sm group-hover:text-primary transition-colors">
                    &lt;
                </span>
            </Link> :
            <div
                className="group flex-1 card p-5 flex flex-col gap-3 hover:border-primary transition-colors"
            >
                <span className="text-sm text-muted group-hover:text-primary transition-colors">
                    {prevLabel}
                </span>
                <p className="text-title text-sm truncate  transition-colors">
                    다음 글이 없습니다.
                </p>
                <span className="text-body text-sm  transition-colors">
                    &lt;
                </span>
            </div>
        } 

            {/* 다음글 */}
            {nextItem ?
            <Link
                href={nextItem.href}
                className="group flex-1 card p-5 flex flex-col items-end gap-3 hover:border-primary transition-colors"
            >
                <span className="text-sm text-muted group-hover:text-primary transition-colors">
                    {nextLabel}
                </span>
                <p className="w-full text-right text-title text-sm truncate group-hover:text-primary transition-colors">
                    {nextItem.title}
                </p>
                <span className="text-body text-sm group-hover:text-primary transition-colors">
                    &gt;
                </span>
            </Link> 
            : <div
                className="group flex-1 card p-5 flex flex-col items-end gap-3 hover:border-primary transition-colors"
            >
                <span className="text-sm text-muted group-hover:text-primary transition-colors">
                    {nextLabel}
                </span>
                <p className="w-full text-right text-title text-sm truncate group-hover:text-primary transition-colors">
                    다음글이 없습니다.
                </p>
                <span className="text-body text-sm group-hover:text-primary transition-colors">
                    &gt;
                </span>
            </div>
        }
            
        </div>
    );
}
