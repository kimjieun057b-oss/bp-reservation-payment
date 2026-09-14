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

    // "사용중" 배지 표시용: 프런트에서 실제로 체크인 처리했고 아직 체크아웃 처리하지 않은 유닛만 표시한다.
    // (예약 날짜 범위가 아니라 /admin/checkinout 페이지의 체크인/체크아웃 처리 여부를 기준으로 한다 —
    // 그래야 체크인 전 오전이나 체크아웃 이후에도 "사용중"으로 잘못 표시되지 않는다.)
    let occupiedRoomIds = new Set<string>();
    if (rooms.length > 0) {
        const { data: activeReservations } = await supabaseAdmin
            .from("reservations")
            .select("room_id")
            .in("room_id", rooms.map((r) => r.id))
            .eq("status", "CONFIRMED")
            .not("checked_in_at", "is", null)
            .is("checked_out_at", null);
        occupiedRoomIds = new Set((activeReservations ?? []).map((r) => r.room_id));
    }

    return NextResponse.json({
        rooms: rooms.map((r) => ({ ...r, is_occupied: occupiedRoomIds.has(r.id) })),
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
