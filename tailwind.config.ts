import type { Config } from "tailwindcss";

// sise パレットは CSS 変数化し、業態テーマ（globals.css の :root / .theme-esthe）で
// 色を切り替える。既定（整体）はオレンジ、エステはロゴに合わせたトープ系。
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sise: {
          50: "var(--sise-50)",
          100: "var(--sise-100)",
          200: "var(--sise-200)",
          300: "var(--sise-300)",
          400: "var(--sise-400)",
          500: "var(--sise-500)",
          600: "var(--sise-600)",
          700: "var(--sise-700)",
          800: "var(--sise-800)",
          900: "var(--sise-900)",
          950: "var(--sise-950)",
        },
      },
      fontFamily: {
        sans: ["var(--font-noto)", "Noto Sans JP", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
