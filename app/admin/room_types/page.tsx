import RoomTypeManager from "@/components/admin/RoomTypeManager";

export default function RoomTypesPage() {
    return (
        <div className="space-y-6">
            <h2 className="page-title">객실/요금 관리</h2>
            <RoomTypeManager />
        </div>
    );
}