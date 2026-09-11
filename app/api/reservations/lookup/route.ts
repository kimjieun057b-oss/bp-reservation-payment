// 예약 조회 - 비로그인 고객이 예약자명 + 전화번호로 본인 예약을 확인 (RLS 우회를 위해 service role 클라이언트 사용)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const normalizePhone = (value: string) => value.replace(/\D/g, "");

export async function POST(request: Request) {
    try {
        const { guest_name, guest_phone } = await request.json();

        if (!guest_name?.trim() || !guest_phone?.trim()) {
            return NextResponse.json({ error: "예약자명과 전화번호를 모두 입력해 주세요." }, { status: 400 });
        }

        const targetPhone = normalizePhone(guest_phone);

        const { data, error } = await supabaseAdmin
            .from("reservations")
            .select(`
                id,
                check_in,
                check_out,
                guest_name,
                guest_phone,
                guest_count,
                status,
                total_price,
                refund_amount,
                hold_expire_at,
                created_at,
                room_types ( name ),
                rooms ( name ),
                properties ( name )
            `)
            .eq("guest_name", guest_name.trim())
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[예약 조회 실패]", error.message);
            return NextResponse.json({ error: "예약 조회 중 오류가 발생했습니다." }, { status: 500 });
        }

        // 전화번호는 저장 형식이 일정하지 않을 수 있어 숫자만 비교
        const reservations = (data ?? []).filter(
            (r) => normalizePhone(r.guest_phone) === targetPhone
        );

        return NextResponse.json({ reservations });
    } catch (err) {
        return NextResponse.json({ error: "서버 내부 오류가 발생했습니다." }, { status: 500 });
    }
}
