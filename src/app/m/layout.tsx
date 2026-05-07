import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../globals.css";
import "./mobile.css";
import SplashIntro from "./_components/SplashIntro";

/**
 * Mobile app shell — Capacitor loads /m/* directly.
 *
 * Notes
 *  - No marketing site header / footer / cookie banner.
 *  - Plus Jakarta Sans is the closest free match to the Figma "Nuckle" font.
 *  - Status bar is opaque white (Capacitor StatusBar.overlaysWebView=false)
 *    so we don't need extra top safe-area padding here for iOS.
 *  - Bottom safe-area padding is applied per-screen via .sc-safe-bottom.
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
        {/* Animated wordmark intro — plays once per session, fades out. */}
        <SplashIntro />
        {children}
      </div>
    </div>
  );
}
