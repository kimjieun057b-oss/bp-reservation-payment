// 객실 상세 (소개/사진/편의시설). 예약은 "실시간예약하기" 버튼 -> /reserve/[id]에서 진행한다.
import RoomTypeDetail from "@/components/reservation/RoomTypeDetail";

export default async function RoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return (
        <section>
            <div>
                <RoomTypeDetail roomTypeId={id} />
            </div>
        </section>
    );
}
