import AddonManager from "@/components/admin/AddonManager";

export default function AddonsPage() {
    return (
        <div className="space-y-6">
            <h2 className="page-title">옵션 관리</h2>
            <AddonManager />
        </div>
    );
}
