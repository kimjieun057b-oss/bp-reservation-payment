import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 컴포넌트("use client")에서 사용하는 브라우저 Supabase 클라이언트
// 세션을 쿠키에 저장/동기화하므로 middleware/서버 컴포넌트에서도 로그인 상태를 읽을 수 있다
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Environment variables");
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
