// 옵션 상품(addons) CRUD - 목록 조회/등록 (예약 시 선택하는 부가상품, property 전체 공통).
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
        .from("addons")
        .select("id, property_id, name, description, price, is_active, created_at")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[GET /api/admin/addons]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 상품 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ addons: data ?? [] });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    // 이 보일러플레이트는 단일 숙소 운영을 전제로 하므로(NFR 6), 첫 번째 property에 귀속시킨다.
    const { data: property, error: propertyError } = await supabaseAdmin
        .from("properties")
        .select("id")
        .limit(1)
        .single();

    if (propertyError || !property) {
        return NextResponse.json({ error: "PROPERTY_NOT_FOUND", message: "등록된 숙소 정보가 없습니다." }, { status: 500 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() || null : null;
    const price = Number(body?.price);

    if (!name) {
        return NextResponse.json({ error: "INVALID_NAME", message: "옵션 상품 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "INVALID_PRICE", message: "가격을 올바르게 입력해 주세요." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("addons")
        .insert({
            property_id: property.id,
            name,
            description,
            price,
        })
        .select()
        .single();

    if (error) {
        console.error("[POST /api/admin/addons]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 상품 등록에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ addon: data }, { status: 201 });
}
