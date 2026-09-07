export type ReservationStatus = "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";

export interface Reservation {
    id: string;
    room_id: string;
    room_type_id: string;
    property_id: string;
    check_in: string;
    check_out: string;
    guest_name: string;
    guest_phone: string;
    guest_email: string | null;
    guest_count: number;
    memo: string | null;
    status: ReservationStatus;
    hold_expire_at: string | null;
    total_price: number;
    cancelled_at: string | null;
    cancel_reason: string | null;
    refund_amount: number | null;
    created_at: string;
    updated_at: string;
}
