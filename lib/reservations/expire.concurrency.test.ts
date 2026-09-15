import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHold } from "./hold";
import { expireDueHolds } from "./expire";

// 관리자 대시보드 진입 시 여러 API 라우트(reservations/rooms/availability)가 거의 동시에
// expireDueHolds()를 호출하는 상황을 재현한다. 실제 Supabase 프로젝트가 필요하므로
// 서비스 키가 없으면 조용히 skip한다 (hold.concurrency.test.ts와 동일한 패턴).
const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasSupabaseEnv)("expireDueHolds 동시 호출 (중복 UPDATE 검증)", () => {
    const ROOM_COUNT = 5;
    // 이 중 몇 개를 "이미 만료된 홀드"로 만들어 둘지
    const DUE_COUNT = 3;
    // 실제 라우트 4곳(reservations/rooms/availability/cron)이 겹치는 상황을 재현
    const CONCURRENT_CALLS = 4;

    let propertyId: string;
    let roomTypeId: string;
    const reservationIds: string[] = [];

    // 실제 운영 데이터와 겹치지 않도록 몇 년 뒤 날짜를 사용한다.
    const checkIn = "2099-03-10";
    const checkOut = "2099-03-12";

    beforeAll(async () => {
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

        const { data: property, error: propertyError } = await supabaseAdmin
            .from("properties")
            .insert({ name: "[TEST] expire 동시성 테스트용 property" })
            .select("id")
            .single();
        if (propertyError || !property) throw new Error(propertyError?.message ?? "property 생성 실패");
        propertyId = property.id;

        const { data: roomType, error: roomTypeError } = await supabaseAdmin
            .from("room_types")
            .insert({
                property_id: propertyId,
                name: "[TEST] expire 동시성 테스트용 room_type",
                base_price: 50000,
            })
            .select("id")
            .single();
        if (roomTypeError || !roomType) throw new Error(roomTypeError?.message ?? "room_type 생성 실패");
        roomTypeId = roomType.id;

        // 서로 다른 유닛을 ROOM_COUNT개 만들어, 같은 기간(checkIn~checkOut)에 대해
        // createHold()를 여러 번 호출해도 유닛별로 하나씩 배정되게 한다.
        for (let i = 0; i < ROOM_COUNT; i++) {
            const { error: roomError } = await supabaseAdmin
                .from("rooms")
                .insert({ room_type_id: roomTypeId, name: `[TEST] ${i + 1}호` });
            if (roomError) throw new Error(roomError.message);
        }

        // createHold()로 정상적인 HOLD 예약을 ROOM_COUNT개 생성한다(유닛마다 하나씩 자동 배정됨).
        for (let i = 0; i < ROOM_COUNT; i++) {
            const result = await createHold({
                room_type_id: roomTypeId,
                check_in: checkIn,
                check_out: checkOut,
                guest_name: `[TEST] 게스트${i + 1}`,
                guest_phone: `010-0000-000${i}`,
            });
            if (!result.ok) throw new Error(`홀드 생성 실패: ${result.error}`);
            reservationIds.push(result.reservation.id);
        }

        // 그중 DUE_COUNT개만 hold_expire_at을 과거로 돌려 "이미 만료된 홀드"로 만든다.
        // 나머지는 아직 유효한 홀드로 남겨서, expireDueHolds()가 대상이 아닌 행은
        // 건드리지 않는지도 함께 확인한다.
        const dueIds = reservationIds.slice(0, DUE_COUNT);
        const pastISO = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1시간 전
        const { error: updateError } = await supabaseAdmin
            .from("reservations")
            .update({ hold_expire_at: pastISO })
            .in("id", dueIds);
        if (updateError) throw new Error(updateError.message);
    });

    afterAll(async () => {
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
        await supabaseAdmin.from("reservations").delete().in("id", reservationIds);
        await supabaseAdmin.from("rooms").delete().eq("room_type_id", roomTypeId);
        await supabaseAdmin.from("room_types").delete().eq("id", roomTypeId);
        await supabaseAdmin.from("properties").delete().eq("id", propertyId);
    });

    it("여러 라우트가 동시에 호출해도 같은 예약이 두 번 만료 처리되지 않는다", async () => {
        const now = new Date();

        const results = await Promise.all(
            Array.from({ length: CONCURRENT_CALLS }, () => expireDueHolds(now))
        );

        const callSizes = results.map((r) => r.length);
        const allReturnedIds = results.flat();

        // 실제로 몇 개의 호출이 "허탕"(0건)을 쳤는지 눈으로 확인하기 위한 로그.
        // 전부 겹치지 않는 완전 순차 실행이라면 [DUE_COUNT, 0, 0, 0] 형태가 되고,
        // DB 레벨에서 쪼개져 나눠 가졌다면 합이 DUE_COUNT인 다른 분포가 나올 수도 있다.
        console.log(`[expire 동시 호출] 각 호출이 반환한 건수: ${JSON.stringify(callSizes)}`);

        // 1) 만료 대상 전체가 정확히 한 번씩만 어딘가의 호출 결과에 포함되어야 한다.
        //    (같은 id가 두 호출 결과에 동시에 나타나면 "중복 UPDATE"가 실제로 발생한 것)
        const uniqueIds = new Set(allReturnedIds);
        expect(uniqueIds.size).toBe(allReturnedIds.length);
        expect(allReturnedIds.sort()).toEqual([...reservationIds.slice(0, DUE_COUNT)].sort());

        // 2) 만료 대상이 아니었던 나머지 홀드는 그대로 HOLD 상태여야 한다.
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
        const { data: finalRows, error } = await supabaseAdmin
            .from("reservations")
            .select("id, status")
            .in("id", reservationIds);
        if (error) throw new Error(error.message);

        const statusById = new Map((finalRows ?? []).map((r) => [r.id, r.status]));
        for (const id of reservationIds.slice(0, DUE_COUNT)) {
            expect(statusById.get(id)).toBe("EXPIRED");
        }
        for (const id of reservationIds.slice(DUE_COUNT)) {
            expect(statusById.get(id)).toBe("HOLD");
        }
    });
});
