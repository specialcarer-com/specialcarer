import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/components/cookie-banner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SpecialCarer — Trusted care, on your schedule",
  description:
    "On-demand and scheduled childcare, elder care, and home support from vetted, background-checked caregivers. UK & US.",
  metadataBase: new URL("https://specialcarer.com"),
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
    title: "SpecialCarer",
    description: "Trusted care, on your schedule.",
    url: "https://specialcarer.com",
    siteName: "SpecialCarer",
    type: "website",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpecialCarer — trusted care, on your schedule",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SpecialCarer",
    description: "Trusted care, on your schedule.",
    images: ["/brand/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#039EA0",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-white text-slate-900">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
