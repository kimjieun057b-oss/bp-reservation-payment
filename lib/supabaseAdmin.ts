import { createClient } from "@supabase/supabase-js";

// 서버(Route Handler) 전용 service role 클라이언트
// RLS를 우회하므로 절대 클라이언트(브라우저) 코드에서 import하지 말 것
// 매번 createClient를 반복 호출하지 않도록 공용화
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Environment variables");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
