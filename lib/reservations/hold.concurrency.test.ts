import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHold } from "./hold";

// NFR(동시성): "동일 객실·기간에 대한 동시 예약 요청 시 DB 제약으로 단 1건만 성공해야 한다"를
// 검증하는 통합 테스트. 실제 Supabase 프로젝트에 마이그레이션(EXCLUDE 제약 포함)이 적용되어 있어야 하므로,
// 로컬/CI에 서비스 키가 없으면 조용히 skip한다.
const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasSupabaseEnv)("createHold 동시성 (EXCLUDE 제약)", () => {
    let propertyId: string;
    let roomTypeId: string;
    let roomId: string;

    // 실제 운영 데이터와 절대 겹치지 않도록 몇 년 뒤 날짜를 사용한다.
    const checkIn = "2099-01-10";
    const checkOut = "2099-01-12";

    beforeAll(async () => {
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

        const { data: property, error: propertyError } = await supabaseAdmin
            .from("properties")
            .insert({ name: "[TEST] 동시성 테스트용 property" })
            .select("id")
            .single();
        if (propertyError || !property) throw new Error(propertyError?.message ?? "property 생성 실패");
        propertyId = property.id;

        const { data: roomType, error: roomTypeError } = await supabaseAdmin
            .from("room_types")
            .insert({
                property_id: propertyId,
                name: "[TEST] 동시성 테스트용 room_type",
                base_price: 50000,
            })
            .select("id")
            .single();
        if (roomTypeError || !roomType) throw new Error(roomTypeError?.message ?? "room_type 생성 실패");
        roomTypeId = roomType.id;

        // 재고를 정확히 1개로 만들어 두 요청이 반드시 같은 유닛을 두고 경합하게 한다.
        const { data: room, error: roomError } = await supabaseAdmin
            .from("rooms")
            .insert({ room_type_id: roomTypeId, name: "[TEST] 101" })
            .select("id")
            .single();
        if (roomError || !room) throw new Error(roomError?.message ?? "room 생성 실패");
        roomId = room.id;
    });

    afterAll(async () => {
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
        await supabaseAdmin.from("reservations").delete().eq("room_id", roomId);
        await supabaseAdmin.from("rooms").delete().eq("id", roomId);
        await supabaseAdmin.from("room_types").delete().eq("id", roomTypeId);
        await supabaseAdmin.from("properties").delete().eq("id", propertyId);
    });

    it("동시에 두 개의 홀드 요청을 보내면 정확히 1건만 성공한다", async () => {
        const [first, second] = await Promise.all([
            createHold({
                room_type_id: roomTypeId,
                check_in: checkIn,
                check_out: checkOut,
                guest_name: "홍길동",
                guest_phone: "010-1111-1111",
            }),
            createHold({
                room_type_id: roomTypeId,
                check_in: checkIn,
                check_out: checkOut,
                guest_name: "김철수",
                guest_phone: "010-2222-2222",
            }),
        ]);

        const results = [first, second];
        const succeeded = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);

        expect(succeeded).toHaveLength(1);
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({ ok: false, error: "ROOM_UNAVAILABLE" });
        expect(succeeded[0]).toMatchObject({ ok: true, reservation: { status: "HOLD", room_id: roomId } });
    });
});
