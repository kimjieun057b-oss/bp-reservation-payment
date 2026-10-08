// 옵션 상품 목록 (BookingCalendar의 옵션 선택 섹션이 사용, 설계문서 4-1 "GET /addons" 참고)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
    const { data: addons, error } = await supabaseAdmin
        .from("addons")
        .select("id, name, description, price")
        .eq("is_active", true)
        .order("price", { ascending: true });

    if (error) {
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: error.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ addons: addons ?? [] });
}
