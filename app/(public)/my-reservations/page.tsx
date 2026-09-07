import ReservationLookupForm from "@/components/reservations/ReservationLookupForm";

// 비로그인 고객용 예약 조회 페이지 - 예약자명 + 전화번호로 본인 예약을 확인한다.
export default function Myreservation() {
    return (
        <section>
            <div>
                <div className="text-center mb-10">
                    <h2>예약 조회</h2>
                    <p className="text-body mt-3">예약 시 입력한 예약자명과 전화번호로 예약 내역을 확인하세요.</p>
                </div>
                <div className="max-w-2xl mx-auto">
                    <ReservationLookupForm />
                </div>
            </div>
        </section>
    );
}