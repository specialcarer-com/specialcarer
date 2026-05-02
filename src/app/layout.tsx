import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SpecialCarer — Trusted care, on your schedule",
  description:
    "On-demand and scheduled childcare, elder care, and home support from vetted, background-checked caregivers. UK & US.",
  metadataBase: new URL("https://specialcarer.com"),
  openGraph: {
    title: "SpecialCarer",
    description: "Trusted care, on your schedule.",
    url: "https://specialcarer.com",
    siteName: "SpecialCarer",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-white text-slate-900">
        {children}
      </body>
    </html>
  );
}
