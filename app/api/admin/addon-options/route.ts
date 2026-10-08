// 부가서비스/옵션 카탈로그 CRUD. room-types/route.ts와 동일한 구조(단일 숙소 전제로 첫 property에 귀속).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from("addon_options")
        .select("id, name, description, price, is_active, created_at")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[GET /api/admin/addon-options]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ addon_options: data ?? [] });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { data: property, error: propertyError } = await supabaseAdmin
        .from("properties")
        .select("id")
        .limit(1)
        .single();

    if (propertyError || !property) {
        return NextResponse.json({ error: "PROPERTY_NOT_FOUND", message: "등록된 숙소 정보가 없습니다." }, { status: 500 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const price = Number(body?.price);
    const description = typeof body?.description === "string" ? body.description.trim() || null : null;

    if (!name) {
        return NextResponse.json({ error: "INVALID_NAME", message: "옵션 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "INVALID_PRICE", message: "가격을 올바르게 입력해 주세요." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("addon_options")
        .insert({ property_id: property.id, name, description, price })
        .select()
        .single();

    if (error) {
        console.error("[POST /api/admin/addon-options]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 생성에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ addon_option: data }, { status: 201 });
}
