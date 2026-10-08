// 부가서비스/옵션 수정/삭제. room-types/[id]/route.ts와 동일한 구조.
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

    let body: Record<string, unknown>;
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
        const name = typeof updates.name === "string" ? updates.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "INVALID_NAME", message: "옵션 이름을 입력해 주세요." }, { status: 400 });
        }
        updates.name = name;
    }
    if ("price" in updates && (!Number.isFinite(Number(updates.price)) || Number(updates.price) < 0)) {
        return NextResponse.json({ error: "INVALID_PRICE", message: "가격을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if ("description" in updates && typeof updates.description === "string") {
        updates.description = updates.description.trim() || null;
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "NO_FIELDS", message: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("addon_options")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("[PATCH /api/admin/addon-options/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 수정에 실패했습니다." }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: "NOT_FOUND", message: "옵션을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ addon_option: data });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    const { error } = await supabaseAdmin.from("addon_options").delete().eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/addon-options/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "옵션 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
