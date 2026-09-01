/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            screens: {
                'pc': '1366px',
            },
            colors: {
                'primary': '#3e69c7',
                'surface': '#f4f6f8',
                'title':   '#111827',
                'body':    '#4b5563',
                'muted':   '#9ca3af',
            },
            fontFamily: {
                'notosans': ['Noto Sans KR', 'sans-serif'],
            },
            boxShadow: {
                'card': '0 4px 12px rgba(0, 0, 0, 0.5)',
            },
        },
    },
    plugins: [],
}
