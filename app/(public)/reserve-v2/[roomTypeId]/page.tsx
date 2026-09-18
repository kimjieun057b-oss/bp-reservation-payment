// 실시간예약2(버전2 UI) 딥링크: 객실안내의 "실시간예약하기"에서 넘어오면 1단계에서
// 해당 객실이 자동으로 선택되어 있어야 한다.
import BookingWizardV2 from "@/components/reservation/wizard-v2/BookingWizardV2";

export default async function ReserveV2RoomTypePage({
    params,
}: {
    params: Promise<{ roomTypeId: string }>;
}) {
    const { roomTypeId } = await params;

    return (
        <section>
            <div>
                <BookingWizardV2 roomTypeId={roomTypeId} />
            </div>
        </section>
    );
}
