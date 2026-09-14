// FR-9 AC1/AC2: 개별 객실 유닛(rooms) CRUD (설계문서 4-2 "GET/POST /admin/rooms").
// 유닛의 is_active=false는 AC2 "특정 객실을 일시적으로 '비활성화(점검중)' 처리"에 해당한다 (PATCH /api/admin/rooms/:id에서 처리).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { expireDueHolds } from "@/lib/reservations/expire";

export async function GET(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    // FR-12 보정: 외부 스케줄러가 아직 못 돈 구간이 있어도, 객실관리 화면의 '사용중' 표시가
    // 실제보다 오래 남아있지 않도록 조회 시점에 만료된 홀드를 먼저 정리한다.
    try {
        await expireDueHolds();
    } catch (err) {
        console.error("[GET /api/admin/rooms] expireDueHolds failed", err);
    }

    const { searchParams } = new URL(request.url);
    const roomTypeId = searchParams.get("room_type_id");

    let query = supabaseAdmin
        .from("rooms")
        .select("id, room_type_id, name, is_active, blocked_from, blocked_until, created_at, room_types ( name )")
        .order("created_at", { ascending: true });

    if (roomTypeId) query = query.eq("room_type_id", roomTypeId);

    const { data, error } = await query;

    if (error) {
        console.error("[GET /api/admin/rooms]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    const rooms = data ?? [];

    // 예약 상태에 따라 서로 다른 배지를 붙인다 (HOLD와 CONFIRMED는 의미가 다르고,
    // CONFIRMED도 체크인 여부에 따라 "결제완료(체크인 전)"와 "사용중(투숙 중)"으로 나뉜다).
    // - HOLD: 체크인 개념이 없는 결제 진행 중 상태 → "결제대기중"
    //   (위에서 expireDueHolds()를 이미 호출했으므로 남아있는 HOLD는 아직 만료 전인 유효한 잠금이다.)
    // - CONFIRMED + 체크인 전 → "결제완료" (아직 프런트에서 체크인 처리를 안 한 상태)
    // - CONFIRMED + 체크인 완료 + 체크아웃 전 → "사용중" (실제 투숙 중, /admin/checkinout의 처리 여부가 기준)
    // - CONFIRMED + 체크아웃 완료 → 세 배지 모두 해당 없음 (다시 빈 방)
    const occupiedRoomIds = new Set<string>();
    const awaitingCheckinRoomIds = new Set<string>();
    const holdingRoomIds = new Set<string>();
    if (rooms.length > 0) {
        const { data: activeReservations } = await supabaseAdmin
            .from("reservations")
            .select("room_id, status, checked_in_at, checked_out_at")
            .in("room_id", rooms.map((r) => r.id))
            .in("status", ["HOLD", "CONFIRMED"]);

        for (const r of activeReservations ?? []) {
            if (r.status === "HOLD") {
                holdingRoomIds.add(r.room_id);
            } else if (!r.checked_in_at) {
                awaitingCheckinRoomIds.add(r.room_id);
            } else if (!r.checked_out_at) {
                occupiedRoomIds.add(r.room_id);
            }
        }
    }

    return NextResponse.json({
        rooms: rooms.map((r) => ({
            ...r,
            is_occupied: occupiedRoomIds.has(r.id),
            is_awaiting_checkin: awaitingCheckinRoomIds.has(r.id),
            is_holding: holdingRoomIds.has(r.id),
        })),
    });
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "INVALID_BODY", message: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const roomTypeId = typeof body?.room_type_id === "string" ? body.room_type_id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!roomTypeId) {
        return NextResponse.json({ error: "INVALID_ROOM_TYPE", message: "객실 타입을 선택해 주세요." }, { status: 400 });
    }
    if (!name) {
        return NextResponse.json({ error: "INVALID_NAME", message: "객실 이름을 입력해 주세요." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("rooms")
        .insert({ room_type_id: roomTypeId, name })
        .select()
        .single();

    if (error) {
        console.error("[POST /api/admin/rooms]", error.message);
        const status = error.code === "23503" ? 400 : 500;
        const message = status === 400 ? "존재하지 않는 객실 타입입니다." : "객실 생성에 실패했습니다.";
        return NextResponse.json({ error: "INTERNAL_ERROR", message }, { status });
    }

    return NextResponse.json({ room: data }, { status: 201 });
}
