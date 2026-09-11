// FR-9 AC1: 객실 타입 수정/삭제 (설계문서 4-2 "PATCH /admin/room-types").
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Params = { params: Promise<{ id: string }> };

const EDITABLE_FIELDS = [
    "name",
    "description",
    "capacity_standard",
    "capacity_max",
    "base_price",
    "extra_person_fee",
    "is_active",
] as const;

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

    if ("name" in updates && (typeof updates.name !== "string" || !updates.name.trim())) {
        return NextResponse.json({ error: "INVALID_NAME", message: "객실 타입 이름을 입력해 주세요." }, { status: 400 });
    }
    if ("base_price" in updates && (!Number.isFinite(Number(updates.base_price)) || Number(updates.base_price) < 0)) {
        return NextResponse.json({ error: "INVALID_BASE_PRICE", message: "기준가를 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "NO_FIELDS", message: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("room_types")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("[PATCH /api/admin/room-types/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 타입 수정에 실패했습니다." }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: "NOT_FOUND", message: "객실 타입을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ room_type: data });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    // room_type_id를 가진 rooms/price_rules/reservations는 FK로 연결돼 있어(reservations는 on delete 제약 없음)
    // 예약 이력이 있는 타입을 삭제하면 정합성이 깨진다. 이력이 있으면 삭제 대신 비활성화를 안내한다.
    const { count, error: countError } = await supabaseAdmin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("room_type_id", id);

    if (countError) {
        console.error("[DELETE /api/admin/room-types/:id]", countError.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "삭제 가능 여부를 확인하지 못했습니다." }, { status: 500 });
    }
    if (count && count > 0) {
        return NextResponse.json(
            { error: "HAS_RESERVATIONS", message: "예약 이력이 있는 객실 타입은 삭제할 수 없습니다. 비활성화를 이용해 주세요." },
            { status: 409 }
        );
    }

    const { error } = await supabaseAdmin.from("room_types").delete().eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/room-types/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 타입 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
