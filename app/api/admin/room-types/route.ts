// FR-9 AC1: 객실 타입 CRUD (설계문서 4-2 "GET/POST /admin/room-types").
// 공개용 /api/room-types는 is_active=true만 노출하므로, 관리자 목록은 비활성 타입도 포함해 전체를 보여준다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." }, { status: 401 });
    }

    // rooms(count): 등록된 유닛 수를 함께 내려줘서, 관리자 목록에서 "유닛 0개(재고없음)" 타입을
    // 한눈에 구분할 수 있게 한다 (유닛 없이는 그 타입이 예약 화면에서 항상 마감으로 보인다).
    const { data, error } = await supabaseAdmin
        .from("room_types")
        .select("id, name, description, capacity_standard, capacity_max, base_price, extra_person_fee, is_active, created_at, rooms(count)")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[GET /api/admin/room-types]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 타입 목록을 불러오지 못했습니다." }, { status: 500 });
    }

    const roomTypes = (data ?? []).map(({ rooms, ...rest }) => ({
        ...rest,
        room_count: (rooms as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ room_types: roomTypes });
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
    const basePrice = Number(body?.base_price);

    if (!name) {
        return NextResponse.json({ error: "INVALID_NAME", message: "객실 타입 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
        return NextResponse.json({ error: "INVALID_BASE_PRICE", message: "기준가를 올바르게 입력해 주세요." }, { status: 400 });
    }

    const capacityStandard = Number.isFinite(Number(body?.capacity_standard)) ? Number(body.capacity_standard) : 2;
    const capacityMax = Number.isFinite(Number(body?.capacity_max)) ? Number(body.capacity_max) : capacityStandard;
    const extraPersonFee = Number.isFinite(Number(body?.extra_person_fee)) ? Number(body.extra_person_fee) : 0;
    const description = typeof body?.description === "string" ? body.description.trim() || null : null;

    const { data, error } = await supabaseAdmin
        .from("room_types")
        .insert({
            property_id: property.id,
            name,
            description,
            capacity_standard: capacityStandard,
            capacity_max: capacityMax,
            base_price: basePrice,
            extra_person_fee: extraPersonFee,
        })
        .select()
        .single();

    if (error) {
        console.error("[POST /api/admin/room-types]", error.message);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: "객실 타입 생성에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ room_type: data }, { status: 201 });
}
