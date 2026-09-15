import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHold } from "./hold";
import {
    expireDueHoldsThrottled,
    getActualCallCount,
    __resetThrottleForTest,
} from "./expireThrottled";

// [실험용] expire.concurrency.test.ts와 동일한 시나리오를, expireDueHolds() 대신
// 디바운스 래퍼(expireDueHoldsThrottled)로 돌려서 실제 DB 호출 횟수가 줄어드는지 확인한다.
const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!hasSupabaseEnv)("expireDueHoldsThrottled (옵션 1 검증)", () => {
    const ROOM_COUNT = 5;
    const DUE_COUNT = 3;
    const CONCURRENT_CALLS = 4;

    let propertyId: string;
    let roomTypeId: string;
    const reservationIds: string[] = [];

    const checkIn = "2099-04-10";
    const checkOut = "2099-04-12";

    beforeAll(async () => {
        const { supabaseAdmin } = await import("@/lib/supabaseAdmin");

        const { data: property, error: propertyError } = await supabaseAdmin
            .from("properties")
            .insert({ name: "[TEST] throttle 검증용 property" })
            .select("id")
            .single();
        if (propertyError || !property) throw new Error(propertyError?.message ?? "property 생성 실패");
        propertyId = property.id;

        const { data: roomType, error: roomTypeError } = await supabaseAdmin
            .from("room_types")
            .insert({
                property_id: propertyId,
                name: "[TEST] throttle 검증용 room_type",
                base_price: 50000,
            })
            .select("id")
            .single();
        if (roomTypeError || !roomType) throw new Error(roomTypeError?.message ?? "room_type 생성 실패");
        roomTypeId = roomType.id;

        for (let i = 0; i < ROOM_COUNT; i++) {
            const { error: roomError } = await supabaseAdmin
                .from("rooms")
                .insert({ room_type_id: roomTypeId, name: `[TEST] ${i + 1}호` });
            if (roomError) throw new Error(roomError.message);
        }

        for (let i = 0; i < ROOM_COUNT; i++) {
            const result = await createHold({
                room_type_id: roomTypeId,
                check_in: checkIn,
                check_out: checkOut,
                guest_name: `[TEST] 게스트${i + 1}`,
                guest_phone: `010-0000-100${i}`,
            });
            if (!result.ok) throw new Error(`홀드 생성 실패: ${result.error}`);
            reservationIds.push(result.reservation.id);
        }

        const dueIds = reservationIds.slice(0, DUE_COUNT);
        const pastISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
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

    it("동시에 4번 호출해도 실제 DB 호출은 1번만 발생한다", async () => {
        __resetThrottleForTest();

        const now = new Date();
        const results = await Promise.all(
            Array.from({ length: CONCURRENT_CALLS }, () => expireDueHoldsThrottled(now))
        );

        const callSizes = results.map((r) => r.length);
        console.log(`[throttled 동시 호출] 각 호출이 반환한 건수: ${JSON.stringify(callSizes)}`);
        console.log(`[throttled 동시 호출] 실제 expireDueHolds() 도달 횟수: ${getActualCallCount()}`);

        // 1) 실제로 DB까지 도달한 건 4번 중 1번뿐이어야 한다 (나머지 3번은 스킵).
        expect(getActualCallCount()).toBe(1);

        // 2) 결과값 자체는 이전 테스트(expire.concurrency.test.ts)와 동일하게 안전해야 한다.
        const allReturnedIds = results.flat();
        expect(new Set(allReturnedIds).size).toBe(allReturnedIds.length);
        expect(allReturnedIds.sort()).toEqual([...reservationIds.slice(0, DUE_COUNT)].sort());

        // 3) DB 상태도 기존과 동일하게 정상 반영되어야 한다.
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
