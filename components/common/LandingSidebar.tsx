export default function LandingSidebar() {

    const handleScroll = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            const headerOffset = 120;
            const elementPosition = element.getBoundingClientRect().top + window.scrollY;
            const offsetPosition = elementPosition - headerOffset;
            window.scrollTo({ top: offsetPosition, behavior: "smooth" });
        }
    };

    return (
        <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden pc:flex flex-col gap-2">
            <ul className="card py-2">
                {[
                    { id: 'landing-a', label: 'Landing A' },
                    { id: 'landing-b', label: 'Landing B' },
                    { id: 'landing-c', label: 'Landing C' },
                    { id: 'landing-d', label: 'Landing D' },
                ].map(({ id, label }) => (
                    <li
                        key={id}
                        onClick={() => handleScroll(id)}
                        className="px-4 py-2 text-xs text-body hover:text-primary hover:bg-surface cursor-pointer transition-colors"
                    >
                        {label}
                    </li>
                ))}
            </ul>
        </div>
    );
}
