import { siteConfig } from "@/config/site";

export default function HomePage() {
    return (
        <section>
            <div className="text-center">
                <h1>{siteConfig.name || "HOME"}</h1>
                <p className="text-body mt-4">예약/결제 보일러플레이트</p>
            </div>
        </section>
    );
}
