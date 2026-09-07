// 객실안내 목록 (FR-1)
import RoomTypeList from "@/components/reservation/RoomTypeList";

export default function RoomsPage() {
    return (
        <section>
            <div>
                <p className="page-title mb-6">객실안내</p>
                <RoomTypeList linkBase="/rooms" />
            </div>
        </section>
    );
}
