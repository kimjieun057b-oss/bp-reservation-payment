// 실시간예약2(버전2 UI) 마법사에서 공유하는 타입 모음.
// BookingCalendar.tsx / CheckoutPanel.tsx와 동일한 API를 재사용하므로 응답 shape도 그대로 맞춘다.
import type { RefundPolicyTier } from "@/lib/reservations/refund";

export interface RoomTypeInfo {
    id: string;
    name: string;
    base_price: number;
    capacity_standard: number;
    capacity_max: number;
}

export interface DayInfo {
    date: string;
    available: boolean;
    isPeak: boolean;
    isWeekend: boolean;
    price: number;
}

export interface AvailabilityResponse {
    room_type: RoomTypeInfo;
    total_rooms: number;
    days: DayInfo[];
    refund_policies: RefundPolicyTier[];
}

export interface AddonInfo {
    id: string;
    name: string;
    description: string | null;
    price: number;
}

export interface ReservationDetail {
    id: string;
    status: "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
    check_in: string;
    check_out: string;
    guest_name: string;
    guest_count: number;
    total_price: number;
    hold_expire_at: string | null;
    refund_amount: number | null;
    room_type_id: string;
    room_types: { name: string } | null;
    rooms: { name: string } | null;
    reservation_addons: { quantity: number; price: number; addons: { name: string } | null }[];
}

export const WIZARD_STEP_LABELS = ["객실선택", "날짜선택", "옵션선택", "예약자정보", "예약완료"] as const;
