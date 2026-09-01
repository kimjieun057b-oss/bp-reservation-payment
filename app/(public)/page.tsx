import { siteConfig } from "@/config/site";

export default function HomePage() {
    return (
        <article>
            <div className="text-center">
                <h1>{siteConfig.name || "HOME"}</h1>
                <p className="text-body mt-4">예약/결제 보일러플레이트 - docs/PRD.md를 참고해 기능을 구현하세요.</p>
            </div>
        </article>
    );
}
