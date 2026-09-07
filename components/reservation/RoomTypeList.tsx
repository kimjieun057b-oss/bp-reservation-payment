// 객실 타입 목록 (FR-1). 상호작용이 필요 없는 정적 목록이라 서버 컴포넌트로 DB를 직접 조회한다.
// rooms/page.tsx(객실안내)와 reserve/page.tsx(실시간예약 1단계)가 linkBase만 다르게 재사용한다.
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface RoomTypeListProps {
    linkBase: string; // 예: "/rooms" 또는 "/reserve" -> 카드 클릭 시 `${linkBase}/${roomTypeId}`로 이동
}

export default async function RoomTypeList({ linkBase }: RoomTypeListProps) {
    const { data: roomTypes } = await supabaseAdmin
        .from("room_types")
        .select("id, name, description, base_price, capacity_standard, capacity_max")
        .eq("is_active", true)
        .order("base_price", { ascending: true });

    if (!roomTypes || roomTypes.length === 0) {
        return <p className="text-sm text-muted">표시할 객실이 없습니다.</p>;
    }

    return (
            <div className="grid gap-4 pc:grid-cols-2">
                {roomTypes.map((roomType) => (
                    <Link
                        key={roomType.id}
                        href={`${linkBase}/${roomType.id}`}
                        className="card p-5 block hover:border-primary transition-colors"
                    >
                        <p className="text-title font-bold mb-1">{roomType.name}</p>
                        {roomType.description && (
                            <p className="text-sm text-muted mb-3 line-clamp-2">{roomType.description}</p>
                        )}
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted">
                                기준 {roomType.capacity_standard}인 · 최대 {roomType.capacity_max}인
                            </span>
                            <span className="text-primary font-bold">
                                {roomType.base_price.toLocaleString()}원~
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
    );
}
