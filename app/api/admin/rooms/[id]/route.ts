// FR-9 AC1/AC2: 개별 객실 유닛 수정(이름/즉시비활성화/점검기간)/삭제.
// "현재 예약(HOLD/CONFIRMED)이 잡혀 있는" 객실은 이름 변경·즉시 비활성화·점검기간 지정을 막는다 —
// 고객이 이미 예약한 상태에서 객실 표기가 바뀌거나 갑자기 이용 불가 처리되면 혼동을 주기 때문.
// (반대로 "과거에 예약이 있었다"는 것만으로는 막지 않는다 — 그건 삭제(DELETE)에서 FK 정합성 보호용으로만 확인한다.)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toISODate } from "@/lib/reservations/pricing";

type Params = { params: Promise<{ id: string }> };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// [from, until) 기간과 겹치는 HOLD/CONFIRMED 예약이 있는지 확인한다. until이 null이면 무기한(그 이후 전부)으로 본다.
async function hasOverlappingActiveReservation(roomId: string, from: string, until: string | null): Promise<boolean> {
    let query = supabaseAdmin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .in("status", ["HOLD", "CONFIRMED"])
        .gt("check_out", from);

    if (until) query = query.lt("check_in", until);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
}

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
    if (body?.name !== undefined) updates.name = body.name;
    if (body?.is_active !== undefined) updates.is_active = body.is_active;
    if (body?.blocked_from !== undefined) updates.blocked_from = body.blocked_from;
    if (body?.blocked_until !== undefined) updates.blocked_until = body.blocked_until;

    if ("name" in updates && (typeof updates.name !== "string" || !updates.name.trim())) {
        return NextResponse.json({ error: "INVALID_NAME", message: "객실 이름을 입력해 주세요." }, { status: 400 });
    }
    if ("is_active" in updates && typeof updates.is_active !== "boolean") {
        return NextResponse.json({ error: "INVALID_IS_ACTIVE", message: "is_active 값이 올바르지 않습니다." }, { status: 400 });
    }
    for (const field of ["blocked_from", "blocked_until"] as const) {
        if (field in updates && updates[field] !== null && !DATE_PATTERN.test(String(updates[field]))) {
            return NextResponse.json({ error: "INVALID_DATE", message: "점검 기간은 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
        }
    }
    if (
        updates.blocked_from &&
        updates.blocked_until &&
        (updates.blocked_until as string) <= (updates.blocked_from as string)
    ) {
        return NextResponse.json({ error: "INVALID_BLOCKED_RANGE", message: "점검 종료일은 시작일 이후여야 합니다." }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "NO_FIELDS", message: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const todayISO = toISODate(new Date());

    try {
        // 이름 변경: 지금 이 순간 이후로 끝나는 예약이 하나라도 있으면 차단.
        if ("name" in updates) {
            if (await hasOverlappingActiveReservation(id, todayISO, null)) {
                return NextResponse.json(
                    { error: "ACTIVE_RESERVATION_EXISTS", message: "예약이 잡혀 있는 객실은 이름을 변경할 수 없습니다." },
                    { status: 409 }
                );
            }
        }

        // 즉시 비활성화 = "오늘부터 무기한 점검"과 같으므로 동일한 기준으로 차단.
        if (updates.is_active === false) {
            if (await hasOverlappingActiveReservation(id, todayISO, null)) {
                return NextResponse.json(
                    { error: "ACTIVE_RESERVATION_EXISTS", message: "예약이 잡혀 있는 객실은 비활성화할 수 없습니다." },
                    { status: 409 }
                );
            }
        }

        // 점검기간 지정/변경: 그 구간과 겹치는 예약이 있으면 차단.
        if (("blocked_from" in updates || "blocked_until" in updates) && updates.blocked_from) {
            const from = updates.blocked_from as string;
            const until = (updates.blocked_until as string | null) ?? null;
            if (await hasOverlappingActiveReservation(id, from, until)) {
                return NextResponse.json(
                    { error: "ACTIVE_RESERVATION_EXISTS", message: "지정한 점검 기간에 이미 예약이 있어 처리할 수 없습니다." },
                    { status: 409 }
                );
            }
        }
    } catch (err) {
        console.error("[PATCH /api/admin/rooms/:id]", err);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "예약 현황을 확인하지 못했습니다." }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
        .from("rooms")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("[PATCH /api/admin/rooms/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 수정에 실패했습니다." }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: "NOT_FOUND", message: "객실을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ room: data });
}

export async function DELETE(_request: Request, { params }: Params) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;

    // reservations.room_id는 not null FK라, 예약 이력이 있는 유닛을 삭제하면 정합성이 깨진다.
    // 이력이 있으면 삭제 대신 비활성화(점검중)를 안내한다.
    const { count, error: countError } = await supabaseAdmin
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("room_id", id);

    if (countError) {
        console.error("[DELETE /api/admin/rooms/:id]", countError.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "삭제 가능 여부를 확인하지 못했습니다." }, { status: 500 });
    }
    if (count && count > 0) {
        return NextResponse.json(
            { error: "HAS_RESERVATIONS", message: "예약 이력이 있는 객실은 삭제할 수 없습니다. 비활성화를 이용해 주세요." },
            { status: 409 }
        );
    }

    const { error } = await supabaseAdmin.from("rooms").delete().eq("id", id);

    if (error) {
        console.error("[DELETE /api/admin/rooms/:id]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 삭제에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
