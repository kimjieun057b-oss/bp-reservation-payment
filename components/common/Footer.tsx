import { siteConfig } from "@/config/site";

export default function Footer() {
    return (
        <footer className="bg-white border-t border-gray-100 mt-auto pb-32 pc:pb-20">
            <div className="max-w-341.5 mx-auto px-5 pc:px-0 py-8">
                <p className="text-xs text-muted text-center md:text-left">
                    © {new Date().getFullYear()}{siteConfig.name ? ` ${siteConfig.name}` : ""}. All rights reserved.
                </p>
            </div>
        </footer>
    );
}
