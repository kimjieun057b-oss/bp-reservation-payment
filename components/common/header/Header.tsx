"use client"
import { USER_CATEGORY } from "@/datas/categories";
import { siteConfig } from "@/config/site";
import Link from "next/link";
import { useState } from "react";

export default function Header() {

    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-card">
                <div className="max-w-341.5 mx-auto px-5 pc:px-0 h-16 flex items-center justify-between">

                    <div>
                        <h3 className="text-base font-bold">
                            <Link href="/" className="text-title hover:text-primary">{siteConfig.name || "HOME"}</Link>
                        </h3>
                    </div>

                    <div className="pc:flex pc:items-center pc:gap-6">
                        <nav className={`fixed top-0 right-0 h-dvh w-[75%] max-w-80 bg-white z-50 shadow-card
                            duration-300 ease-in-out
                            pc:static pc:h-auto pc:w-auto pc:max-w-none pc:shadow-none pc:translate-x-0
                            ${isOpen ? "translate-x-0" : "translate-x-full"}`}>

                            <div className="flex justify-end px-5 py-4 pc:hidden">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="text-title text-xl leading-none cursor-pointer"
                                    aria-label="메뉴 닫기"
                                >
                                    ✕
                                </button>
                            </div>

                            <ul className="flex flex-col px-5 pc:px-0 pc:flex-row pc:items-center gap-1 pc:gap-6">
                                {Object.entries(USER_CATEGORY).map(([key, c]) => {
                                    const hasSubMenu = c.categories && c.categories.length > 0;
                                    return (
                                        <li key={key} className="relative group pc:border-0 border-b border-gray-100 last:border-0">
                                            {hasSubMenu ? (
                                                <p className="text-sm font-medium text-body cursor-default py-3 pc:py-5">{c.title}</p>
                                            ) : (
                                                <Link
                                                    href={`/${key}`}
                                                    onClick={() => setIsOpen(false)}
                                                    className="text-sm font-medium text-body hover:text-primary py-3 pc:py-5 block"
                                                >
                                                    {c.title}
                                                </Link>
                                            )}
                                            {hasSubMenu && (
                                                <ul className="flex flex-col gap-0.5 pb-2
                                                    pc:hidden pc:absolute pc:top-full pc:left-0 pc:mt-0 pc:w-36 pc:bg-white pc:border pc:border-gray-100 pc:rounded-lg pc:shadow-card pc:group-hover:block pc:py-1 pc:z-50 pc:pb-0">
                                                    {c.categories!.map((sub) => (
                                                        <li key={sub.url}>
                                                            <Link
                                                                href={`/${key}/${sub.url}`}
                                                                onClick={() => setIsOpen(false)}
                                                                className="block py-2 pc:px-4 pc:py-2.5 text-sm text-muted pc:text-body hover:text-primary pc:hover:bg-surface transition-colors"
                                                            >
                                                                {sub.name}
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>

                        <button
                            type="button"
                            onClick={() => setIsOpen(true)}
                            className="pc:hidden flex flex-col justify-center gap-1 w-6 h-5 shrink-0 cursor-pointer"
                            aria-label="메뉴 열기"
                        >
                            <span className="block h-0.5 w-full bg-title rounded-full"></span>
                            <span className="block h-0.5 w-full bg-title rounded-full"></span>
                            <span className="block h-0.5 w-full bg-title rounded-full"></span>
                        </button>
                    </div>
                </div>
            </header>

            <div
                className={`fixed inset-0 bg-black/50 z-40 pc:hidden transition-opacity duration-300
                    ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
                onClick={() => setIsOpen(false)}
            />
        </>
    );
}
