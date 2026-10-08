import PhoneBookingForm from "@/components/admin/PhoneBookingForm";

export default function PhoneReservationsPage() {
    return (
        <div className="space-y-6">
            <h2 className="page-title">전화 예약 입력</h2>
            <PhoneBookingForm />
        </div>
    );
}
