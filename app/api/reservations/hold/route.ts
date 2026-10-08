// FR-2: 임시 홀드 생성 API (설계문서 4-1 "POST /reservations/hold" 참고)
import { NextResponse } from "next/server";
import { createHold, type CreateHoldError, type AddonSelection } from "@/lib/reservations";

const STATUS_BY_ERROR: Record<CreateHoldError, number> = {
    INVALID_DATES: 400,
    ROOM_TYPE_NOT_FOUND: 404,
    ROOM_UNAVAILABLE: 409,
    ADDON_NOT_FOUND: 404,
};

const MESSAGE_BY_ERROR: Record<CreateHoldError, string> = {
    INVALID_DATES: "체크아웃 날짜는 체크인 날짜보다 이후여야 합니다.",
    ROOM_TYPE_NOT_FOUND: "존재하지 않거나 비활성화된 객실 타입입니다.",
    ROOM_UNAVAILABLE: "선택하신 날짜는 이미 예약이 진행 중입니다.",
    ADDON_NOT_FOUND: "존재하지 않거나 비활성화된 옵션입니다.",
};

interface RawAddonSelection {
    addon_id?: unknown;
    quantity?: unknown;
}

function parseAddons(raw: unknown): AddonSelection[] {
    if (!Array.isArray(raw)) return [];
    return (raw as RawAddonSelection[])
        .filter((item) => typeof item?.addon_id === "string" && typeof item?.quantity === "number")
        .map((item) => ({ addon_id: item.addon_id as string, quantity: item.quantity as number }));
}

export async function POST(request: Request) {
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "INVALID_BODY", message: "요청 본문을 확인해주세요." },
            { status: 400 }
        );
    }

    const { room_type_id, check_in, check_out, guest_name, guest_phone, guest_email, guest_count, memo, addons } =
        body as Record<string, unknown>;

    if (!room_type_id || !check_in || !check_out || !guest_name || !guest_phone) {
        return NextResponse.json(
            { error: "MISSING_FIELDS", message: "필수 항목이 누락되었습니다." },
            { status: 400 }
        );
    }

    try {
        const result = await createHold({
            room_type_id: String(room_type_id),
            check_in: String(check_in),
            check_out: String(check_out),
            guest_name: String(guest_name),
            guest_phone: String(guest_phone),
            guest_email: guest_email ? String(guest_email) : undefined,
            guest_count: guest_count ? Number(guest_count) : undefined,
            memo: memo ? String(memo) : undefined,
            addons: parseAddons(addons),
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error, message: MESSAGE_BY_ERROR[result.error] },
                { status: STATUS_BY_ERROR[result.error] }
            );
        }

        return NextResponse.json(
            {
                reservation_id: result.reservation.id,
                status: result.reservation.status,
                hold_expire_at: result.reservation.hold_expire_at,
                total_price: result.reservation.total_price,
            },
            { status: 201 }
        );
    } catch (err) {
        console.error("[POST /api/reservations/hold]", err);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: "서버 내부 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}
