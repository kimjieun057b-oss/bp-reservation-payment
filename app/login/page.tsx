import Link from "next/link";
import NomalLoginForm from "@/components/auth/NomalLoginForm";
import { siteConfig } from "@/config/site";

// 관리자 로그인 페이지 (customer 사이트 Header/Footer 없이 단독 레이아웃으로 표시)
export default function AdminLoginPage() {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-surface px-5">
            <div className="card w-full max-w-sm p-8">
                <div className="mb-8 text-center">
                    <h1 className="text-lg font-bold text-title">{siteConfig.name || "ADMIN"}</h1>
                    <p className="mt-1.5 text-sm text-muted">관리자 계정으로 로그인해 주세요</p>
                </div>

                <NomalLoginForm />

                <div className="mt-6 text-center">
                    <Link href="/" className="text-xs text-muted hover:text-primary transition-colors">
                        사이트로 돌아가기
                    </Link>
                </div>
            </div>
        </div>
    );
}
