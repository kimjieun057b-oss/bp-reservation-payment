import CalendarBoard from "@/components/admin/CalendarBoard";

export default function CalendarPage() {
    return (
        <div className="space-y-6">
            <h2 className="page-title">예약 캘린더</h2>
            <CalendarBoard />
        </div>
    );
}
