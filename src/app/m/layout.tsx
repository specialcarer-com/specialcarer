import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../globals.css";
import "./mobile.css";
import SplashIntro from "./_components/SplashIntro";
import StatusBarController from "@/components/native/StatusBarController";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";

/**
 * Mobile app shell — Capacitor loads /m/* directly.
 *
 * Notes
 *  - No marketing site header / footer / cookie banner.
 *  - Plus Jakarta Sans is the closest free match to the Figma "Nuckle" font.
 *  - Status bar overlays the WebView (Capacitor StatusBar.overlaysWebView=true)
 *    so the splash overlay reaches edge-to-edge. StatusBarController flips
 *    glyph colour from LIGHT (splash) → DARK (app chrome) at runtime.
 *  - Bottom safe-area padding is applied per-screen via .sc-safe-bottom.
 *  - LocaleProvider wraps children to provide i18n + accessibility context.
 */

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpecialCarer",
  description: "Trusted care, on your schedule.",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function MobileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${jakarta.variable} sc-mobile-root`}>
      <div className="font-display antialiased text-heading bg-bg-screen min-h-[100dvh]">
        {/* Skip to main content — visually hidden until focused (WCAG 2.2 AA) */}
        <a
          href="#sc-main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[10000] focus:bg-white focus:px-3 focus:py-2 focus:rounded focus:text-[14px] focus:font-semibold focus:text-heading focus:shadow-card"
        >
          Skip to main content
        </a>
        {/* Animated wordmark intro — plays once per session, fades out. */}
        <SplashIntro />
        {/* Runtime status-bar glyph controller (no-op on web). */}
        <StatusBarController />
        <LocaleProvider>
          <main id="sc-main" tabIndex={-1}>
            {children}
          </main>
        </LocaleProvider>
      </div>
    </div>
  );
}
