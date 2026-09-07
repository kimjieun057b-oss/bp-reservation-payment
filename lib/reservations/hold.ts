import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculateTotalPrice } from "./pricing";
import type { Reservation } from "./types";

// FR-2: 홀드 유지시간은 프로젝트별 환경설정 값으로 변경 가능해야 한다 (기본 10분, DEC-001).
const HOLD_DURATION_MINUTES = Number(process.env.RESERVATION_HOLD_MINUTES ?? 10);

// Postgres exclusion_violation: 같은 room_id·기간에 이미 HOLD/CONFIRMED 예약이 있어 EXCLUDE 제약에 걸린 경우.
const EXCLUSION_VIOLATION = "23P01";

export interface CreateHoldInput {
    room_type_id: string;
    check_in: string;
    check_out: string;
    guest_name: string;
    guest_phone: string;
    guest_email?: string;
    guest_count?: number;
    memo?: string;
}

export type CreateHoldError = "INVALID_DATES" | "ROOM_TYPE_NOT_FOUND" | "ROOM_UNAVAILABLE";

export type CreateHoldResult =
    | { ok: true; reservation: Reservation }
    | { ok: false; error: CreateHoldError };

// FR-2 / NFR(동시성): 같은 room_type의 개별 유닛(rooms)을 순회하며 INSERT를 시도한다.
// 이미 다른 예약과 날짜가 겹치는 유닛은 DB의 EXCLUDE 제약이 물리적으로 INSERT를 거부하므로,
// 애플리케이션 코드는 그 실패를 잡아 다음 유닛으로 자동 폴백하기만 하면 된다(설계문서 4-1 참고).
export async function createHold(input: CreateHoldInput): Promise<CreateHoldResult> {
    if (input.check_out <= input.check_in) {
        return { ok: false, error: "INVALID_DATES" };
    }

    const { data: roomType } = await supabaseAdmin
        .from("room_types")
        .select("id, property_id")
        .eq("id", input.room_type_id)
        .eq("is_active", true)
        .single();

    if (!roomType) {
        return { ok: false, error: "ROOM_TYPE_NOT_FOUND" };
    }

    const totalPrice = await calculateTotalPrice(
        supabaseAdmin,
        input.room_type_id,
        input.check_in,
        input.check_out
    );

    const { data: rooms, error: roomsError } = await supabaseAdmin
        .from("rooms")
        .select("id")
        .eq("room_type_id", input.room_type_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

    if (roomsError) {
        throw new Error(roomsError.message);
    }

    const holdExpireAt = new Date(Date.now() + HOLD_DURATION_MINUTES * 60 * 1000).toISOString();

    for (const room of rooms ?? []) {
        const { data, error } = await supabaseAdmin
            .from("reservations")
            .insert({
                room_id: room.id,
                room_type_id: input.room_type_id,
                property_id: roomType.property_id,
                check_in: input.check_in,
                check_out: input.check_out,
                guest_name: input.guest_name,
                guest_phone: input.guest_phone,
                guest_email: input.guest_email ?? null,
                guest_count: input.guest_count ?? 1,
                memo: input.memo ?? null,
                status: "HOLD",
                hold_expire_at: holdExpireAt,
                total_price: totalPrice,
            })
            .select()
            .single();

        if (!error && data) {
            return { ok: true, reservation: data as Reservation };
        }

        if (error && error.code !== EXCLUSION_VIOLATION) {
            throw new Error(error.message);
        }
        // EXCLUSION_VIOLATION이면 이 유닛은 이미 선점됨 -> 다음 유닛 시도
    }

    return { ok: false, error: "ROOM_UNAVAILABLE" };
}
