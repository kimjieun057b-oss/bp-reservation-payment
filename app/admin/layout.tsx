import SideMenu from "@/components/common/category/SideMenu";
import AdminHeader from "@/components/common/header/AdminHeader";

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
                <div className="w-full min-h-screen overflow-auto bg-[#f2f2f2]">
                    <div className="w-full max-w-350 p-20 mx-auto my-0">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
}
