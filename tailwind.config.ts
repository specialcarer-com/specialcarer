import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0E7C7B",
          50: "#E6F4F4",
          100: "#C2E5E4",
          500: "#0E7C7B",
          600: "#0B6463",
          700: "#084C4B",
        },
        accent: {
          DEFAULT: "#F4A261",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
