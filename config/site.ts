// 보일러플레이트를 새 프로젝트로 복제할 때 이 파일만 채우면 됨.
// 브랜드/연락처/메타데이터가 컴포넌트 곳곳에 흩어지지 않도록 이 한 곳에서만 관리한다.
export const siteConfig = {
    // 사이트/브랜드 이름 - 헤더 로고, 메일/메타데이터 등에서 공용으로 사용
    name: "",

    // 검색엔진/SNS 공유 카드용 설명
    description: "",

    // 배포 도메인 (마지막에 슬래시 없이) - OG/sitemap 등에 사용
    url: "https://www.",

    // 대표 연락처 - Footer, 문의 메일 등에서 사용
    contact: {
        email: process.env.RECEIVER_EMAIL ?? "",
        phone: "",
        address: "",
    },

    // OG 이미지 경로 (public 기준)
    ogImage: "/images/og_image.png",
} as const;
