import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import HeroSection from "@/components/landing/HeroSection";
import OfferSection from "@/components/landing/OfferSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import TrustSection from "@/components/landing/TrustSection";
import PricingSection from "@/components/landing/PricingSection";
import FaqSection from "@/components/landing/FaqSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";

// Plus Jakarta Sans is the only typeface used on this surface. Scoped to the
// page via the CSS variable + Tailwind `font-display` token so it does not
// alter the rest of the marketing site (which runs on Inter).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const TITLE = "Become a Founding Carer — SpecialCarer";
const DESCRIPTION =
  "Join the first 100 carers on SpecialCarer — free to join, with a Founding-carer badge, priority placement, and a direct line to the team. Set your own hours, choose your families, and keep more of what you earn.";
const PATH = "/founding-carer";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PATH,
    siteName: "SpecialCarer",
    type: "website",
    locale: "en_GB",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Become a founding carer on SpecialCarer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/brand/og-image.png"],
  },
};

export default function FoundingCarerPage() {
  return (
    <main className={`${jakarta.variable} font-display`}>
      <HeroSection />
      <OfferSection />
      <HowItWorksSection />
      <TrustSection />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />
    </main>
  );
}
