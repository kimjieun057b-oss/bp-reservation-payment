import ReservationList from "@/components/admin/ReservationList";

export default function AdminReservationsPage() {
    return (
        <div className="space-y-6">
            <h2 className="page-title">예약 관리</h2>
            <ReservationList />
        </div>
    );
}
