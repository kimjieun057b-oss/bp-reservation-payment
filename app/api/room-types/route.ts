// FR-1: 객실 타입 목록 (BookingCalendar의 인라인 객실 선택기가 사용)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
    const { data: roomTypes, error } = await supabaseAdmin
        .from("room_types")
        .select("id, name, base_price, capacity_standard, capacity_max")
        .eq("is_active", true)
        .order("base_price", { ascending: true });

    if (error) {
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: error.message },
            { status: 500 }
        );
    }

    return NextResponse.json({ room_types: roomTypes ?? [] });
}
