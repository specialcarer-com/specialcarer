import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import CookieBanner from "@/components/cookie-banner";
import SkipToContent from "@/components/skip-to-content";
import { dirFor, isAppLocale, DEFAULT_LOCALE } from "@/i18n/config";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SpecialCarers — Trusted care, on your schedule",
  description:
    "On-demand and scheduled childcare, elder care, and home support from vetted, DBS-checked caregivers across the UK.",
  metadataBase: new URL("https://www.specialcarers.com"),
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/brand/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: "/brand/favicon.ico",
  },
  openGraph: {
    title: "SpecialCarers",
    description: "Trusted care, on your schedule.",
    url: "https://www.specialcarers.com",
    siteName: "SpecialCarers",
    type: "website",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpecialCarers — trusted care, on your schedule",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SpecialCarers",
    description: "Trusted care, on your schedule.",
    images: ["/brand/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#039EA0",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const resolved = await getLocale();
  const locale = isAppLocale(resolved) ? resolved : DEFAULT_LOCALE;
  const messages = await getMessages();
  const dir = dirFor(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      className={inter.variable}
      // RTL locales fall back to a system stack with broad Arabic-script
      // coverage (Plus Jakarta Sans / Inter have no Urdu glyphs).
      style={
        dir === "rtl"
          ? { fontFamily: 'system-ui, "Noto Sans Arabic", sans-serif' }
          : undefined
      }
    >
      <body className="font-sans antialiased bg-white text-slate-900">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SkipToContent />
        {/* Site-wide "Beta is live" banner — only renders when
            NEXT_PUBLIC_TESTFLIGHT_URL is set in the deploy env. */}
        {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
          <div className="bg-brand-600 text-white text-sm">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center">
              <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                <span className="font-semibold">Beta is live on iOS.</span>
              </span>
              <a
                href={process.env.NEXT_PUBLIC_TESTFLIGHT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-white/60 underline-offset-2 hover:decoration-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-1 focus:ring-offset-brand-600 rounded"
              >
                Join via TestFlight →
              </a>
            </div>
          </div>
        ) : null}

          {children}
          <CookieBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
