import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// /admin 페이지 및 /api/admin 라우트 접근 시 Supabase Auth 세션 유무를 확인.
// 세션이 없으면 페이지는 /login으로 리다이렉트, API는 401 JSON을 반환.
// 공개 회원가입을 쓰지 않으므로 로그인된 계정 = 관리자가 직접 발급한 계정이라는 전제.
export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        if (request.nextUrl.pathname.startsWith('/api')) {
            return NextResponse.json(
                { error: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' },
                { status: 401 }
            );
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return response;
}

export const config = {
    matcher: ['/admin/:path*', '/api/admin/:path*'],
};
