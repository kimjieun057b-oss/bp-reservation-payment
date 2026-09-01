import Header from "@/components/common/header/Header";
import Footer from "@/components/common/Footer";

export default function SiteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <Header />
            {children}
            <Footer />
        </>
    );
}
