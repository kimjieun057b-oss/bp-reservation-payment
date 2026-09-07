// 실시간예약: 객실이 정해지지 않은 상태로 들어오면 BookingCalendar가 자체적으로 선택기부터 보여준다.
import BookingCalendar from "@/components/reservation/BookingCalendar";

export default function ReservePage() {
    return (
        <section>
            <div>
                <BookingCalendar />
            </div>
        </section>
    );
}
