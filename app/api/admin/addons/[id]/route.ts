// 옵션 상품 수정/삭제.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Params = { params: Promise<{ id: string }> };

const EDITABLE_FIELDS = ["name", "description", "price", "is_active"] as const;

export async function PATCH(request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
        if (body?.[field] === undefined) continue;
        updates[field] = body[field];
    }

    if ("name" in updates) {
        updates.name = typeof updates.name === "string" ? updates.name.trim() : "";
        if (!updates.name) {
            return NextResponse.json({ error: "INVALID_NAME", message: "옵션 상품 이름을 입력해 주세요." }, { status: 400 });
        }
    }
    if ("description" in updates) {
        updates.description = typeof updates.description === "string" ? updates.description.trim() || null : null;
    }
    if ("price" in updates) {
        updates.price = Number(updates.price);
        if (!Number.isFinite(updates.price) || (updates.price as number) < 0) {
            return NextResponse.json({ error: "INVALID_PRICE", message: "가격을 올바르게 입력해 주세요." }, { status: 400 });
        }
    }
    if ("is_active" in updates && typeof updates.is_active !== "boolean") {
        return NextResponse.json({ error: "INVALID_IS_ACTIVE", message: "is_active 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "NO_FIELDS", message: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("addons")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("[PATCH /api/admin/addons/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 상품 수정에 실패했습니다." }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: "NOT_FOUND", message: "옵션 상품을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ addon: data });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    // reservation_addons.addon_id는 FK로 연결돼 있어(on delete 제약 없음), 예약에서 이미 선택된
    // 옵션을 삭제하면 정합성이 깨진다. 선택 이력이 있으면 삭제 대신 비활성화를 안내한다.
    const { count, error: countError } = await supabaseAdmin
        .from("reservation_addons")
        .select("id", { count: "exact", head: true })
        .eq("addon_id", id);

    if (countError) {
        console.error("[DELETE /api/admin/addons/:id]", countError.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "삭제 가능 여부를 확인하지 못했습니다." }, { status: 500 });
    }
    if (count && count > 0) {
        return NextResponse.json(
            { error: "HAS_RESERVATIONS", message: "예약에서 선택된 이력이 있는 옵션은 삭제할 수 없습니다. 비활성화를 이용해 주세요." },
            { status: 409 }
        );
    }

    const { error } = await supabaseAdmin.from("addons").delete().eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/addons/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 상품 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
