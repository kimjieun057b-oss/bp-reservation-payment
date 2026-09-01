import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// /admin 및 하위경로 접근 시 admin_session 쿠키 유무를 확인
// 없으면 /login으로 리다이렉트
export function middleware(request: NextRequest) {
    const session = request.cookies.get('admin_session');

    if (!session?.value) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};
