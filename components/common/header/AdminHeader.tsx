import Link from "next/link";
import LogoutButton from "../LogoutButton";

export default function AdminHeader() {
    return (
        <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
            <div className="px-6 h-14 flex items-center justify-between">
                <h3 className="text-sm font-bold">
                    <Link href="/admin" className="text-title hover:text-primary">ADMIN</Link>
                </h3>
                <div>
                    <ul className="flex items-center gap-4">
                        <li>
                            <Link href="/" className="text-sm text-body hover:text-primary transition-colors">
                                사이트 돌아가기
                            </Link>
                        </li>
                        <li>
                            <LogoutButton />
                        </li>
                    </ul>
                </div>
            </div>
        </header>
    );
}
