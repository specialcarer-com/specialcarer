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
          // ── Mobile redesign semantic tokens (PR-R1) ──────────────
          // Behind NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED. Mirrored as CSS
          // vars in globals.css. Named keys (teal/peach/cream/ink) sit
          // alongside the marketing scale above without clobbering it.
          teal: "#039EA0",
          peach: "#F4A261",
          cream: "#F4EFE6",
          ink: "#0F1416",
        },
        accent: { DEFAULT: "#F4A261" },

        // Semantic state colours (WCAG AA, >=4.5:1 on white).
        state: {
          success: "#1B7F4B",
          warning: "#B9651A",
          error: "#C2362F",
          info: "#1E6FB8",
        },

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
      // Mobile redesign spacing scale (PR-R1): 4 / 8 / 12 / 16 / 24 px.
      // Available as p-mobile-xs, gap-mobile-md, etc.
      spacing: {
        "mobile-xs": "4px",
        "mobile-sm": "8px",
        "mobile-md": "12px",
        "mobile-lg": "16px",
        "mobile-xl": "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)",
        nav: "0 -2px 10px rgba(15, 23, 42, 0.05)",
        // Mobile redesign elevation tokens (PR-R1).
        "card-sm": "0 1px 2px rgba(15, 20, 22, 0.06)",
        "card-md": "0 4px 16px rgba(15, 20, 22, 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
