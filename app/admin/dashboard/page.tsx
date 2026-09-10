import DashboardSummary from "@/components/admin/DashboardSummary";

export default function DashboardPage() {
    return (
        <div className="space-y-6">
            <h2 className="page-title">대시보드</h2>
            <DashboardSummary />
        </div>
    );
}
