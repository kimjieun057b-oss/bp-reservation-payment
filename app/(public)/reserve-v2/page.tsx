// 실시간예약2(버전2 UI): 객실이 정해지지 않은 상태로 들어오면 1단계에서 직접 고른다.
import BookingWizardV2 from "@/components/reservation/wizard-v2/BookingWizardV2";

export default function ReserveV2Page() {
    return (
        <section>
            <div>
                <BookingWizardV2 />
            </div>
        </section>
    );
}
