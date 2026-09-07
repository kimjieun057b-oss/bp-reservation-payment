// 결제 페이지 (설계문서 5장: holdExpireAt 카운트다운 표시)
import CheckoutPanel from "@/components/reservation/CheckoutPanel";

export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ reservationId: string }>;
}) {
    const { reservationId } = await params;

    return <CheckoutPanel reservationId={reservationId} />;
}
