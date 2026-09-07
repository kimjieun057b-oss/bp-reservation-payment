import SideMenu from "@/components/layout/SideMenu";
import AdminHeader from "@/components/layout/AdminHeader";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <AdminHeader />
            <div className="flex">
                <SideMenu />
                <div className="w-full min-h-screen overflow-auto bg-surface">
                    <div className="w-full max-w-300 p-20 mx-auto my-0">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
}
