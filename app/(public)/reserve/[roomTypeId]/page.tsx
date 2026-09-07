// 실시간예약 2단계: 선택한 객실 타입의 날짜/고객정보 입력 (첨부 화면 위치)
import Link from "next/link";
import BookingCalendar from "@/components/reservation/BookingCalendar";

export default async function ReserveRoomTypePage({
    params,
}: {
    params: Promise<{ roomTypeId: string }>;
}) {
    const { roomTypeId } = await params;

    return (
        <section>
            <div>
                <Link href="/reserve" className="text-sm text-muted hover:text-primary block mb-4">
                    ‹ 객실 다시 선택
                </Link>
                <BookingCalendar roomTypeId={roomTypeId} />
            </div>
        </section>
    );
}
