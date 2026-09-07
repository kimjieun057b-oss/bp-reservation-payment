// 객실 소개 (설명/사진/편의시설/기준정보). 예약 캘린더는 여기 두지 않고
// "실시간예약하기" 버튼을 눌렀을 때만 /reserve/[roomTypeId]에서 BookingCalendar로 진입한다.
// (rooms/[id]에 캘린더까지 같이 있으면 화면이 커져서 reserve와 구분이 잘 안 된다는 이유로 분리했다.)
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface RoomTypeDetailProps {
    roomTypeId: string;
}

export default async function RoomTypeDetail({ roomTypeId }: RoomTypeDetailProps) {
    const { data: roomType } = await supabaseAdmin
        .from("room_types")
        .select(
            "id, name, description, capacity_standard, capacity_max, base_price, extra_person_fee, amenities, images, properties(checkin_time, checkout_time)"
        )
        .eq("id", roomTypeId)
        .eq("is_active", true)
        .single();

    if (!roomType) {
        notFound();
    }

    const images = (roomType.images as string[] | null) ?? [];
    const amenities = (roomType.amenities as string[] | null) ?? [];
    // supabase-js는 Database 제네릭 없이는 to-one 관계도 배열로 추론하므로 unknown을 거쳐 캐스팅한다
    // (실제 런타임 응답은 객체 - CheckoutPanel의 room_types(name) 조회에서도 동일하게 확인함).
    const property = roomType.properties as unknown as { checkin_time: string; checkout_time: string } | null;

    return (
        <div>
            <Link href="/rooms" className="text-sm text-muted hover:text-primary">
                ‹ 객실안내로
            </Link>

            <div className="mt-4">
                {images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 pc:grid-cols-4">
                        {images.map((src) => (
                            <img key={src} src={src} alt={roomType.name} className="rounded-lg aspect-square object-cover" />
                        ))}
                    </div>
                ) : (
                    <div className="card aspect-video flex items-center justify-center text-sm text-muted">
                        등록된 사진이 없습니다
                    </div>
                )}
            </div>

            <h1 className="mt-6 mb-2">{roomType.name}</h1>
            {roomType.description && <p className="text-body mb-6">{roomType.description}</p>}

            <div className="card p-5 grid grid-cols-2 pc:grid-cols-4 gap-4 text-sm mb-6">
                <div>
                    <p className="text-muted mb-1">기준/최대 인원</p>
                    <p className="text-title font-medium">
                        {roomType.capacity_standard}인 / {roomType.capacity_max}인
                    </p>
                </div>
                <div>
                    <p className="text-muted mb-1">평일 요금</p>
                    <p className="text-title font-medium">{roomType.base_price.toLocaleString()}원~</p>
                </div>
                {property && (
                    <>
                        <div>
                            <p className="text-muted mb-1">체크인</p>
                            <p className="text-title font-medium">{property.checkin_time.slice(0, 5)}</p>
                        </div>
                        <div>
                            <p className="text-muted mb-1">체크아웃</p>
                            <p className="text-title font-medium">{property.checkout_time.slice(0, 5)}</p>
                        </div>
                    </>
                )}
            </div>

            {amenities.length > 0 && (
                <div className="mb-8">
                    <p className="text-sm text-muted mb-2">편의시설</p>
                    <div className="flex flex-wrap gap-2">
                        {amenities.map((item) => (
                            <span key={item} className="badge badge-muted">
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <Link href={`/reserve/${roomType.id}`} className="btn-primary block text-center pc:w-80">
                실시간예약하기
            </Link>
        </div>
    );
}
