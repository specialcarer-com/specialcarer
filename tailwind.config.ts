import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // ── Marketing site palette (kept for / pages) ────────────────
        brand: {
          DEFAULT: "#0E7C7B",
          50: "#E6F4F4",
          100: "#C2E5E4",
          500: "#0E7C7B",
          600: "#0B6463",
          700: "#084C4B",
        },
        accent: { DEFAULT: "#F4A261" },

        // ── Mobile app palette (Figma "Care App Redesign") ───────────
        // Used by /m/* routes only.
        primary: {
          DEFAULT: "#039EA0", // Brand teal
          50: "#E6F5F5",
          100: "#CCEBEB",
          500: "#039EA0",
          600: "#028688",
          700: "#016E70",
        },
        secondary: {
          DEFAULT: "#171E54", // Navy
          50: "#E8E9F0",
          500: "#171E54",
        },
        heading: "#2F2E31",
        subheading: "#575757",
        bg: {
          screen: "#F7FAFA", // very pale grey-teal page background
          card: "#FFFFFF",
        },
        muted: "#F2F4F4",
        line: "#E9ECEC",
        // Status pills used on cards
        status: {
          requested: "#F6E0B5",
          confirmed: "#CCEBEB",
          completed: "#D6F2DA",
          cancelled: "#F8D7D7",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Mobile app font (Plus Jakarta Sans — closest free sub for "Nuckle")
        display: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        pill: "9999px",
        btn: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)",
        nav: "0 -2px 10px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
