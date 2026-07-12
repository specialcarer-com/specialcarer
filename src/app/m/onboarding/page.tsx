"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppLogo, Button, Dots } from "../_components/ui";
import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";

/**
 * Three-screen onboarding carousel.
 *
 * Two layouts share one data source:
 *  - Legacy (Figma 2:594 / 2:660 / 2:705): centered organic-blob photo,
 *    headline + 3-line body where the third line is brand-navy ("hook line").
 *  - Redesign (PR-R5, IMG_6537.jpeg "Phone A"): full-bleed lifestyle photo
 *    with a bottom gradient overlay, "SPECIAL CARERS" wordmark, uppercase
 *    segment label (e.g. "TEEN & SEN SUPPORT"), white headline over the
 *    image, and a "COMING SOON" pill bottom-left. Same Skip / Next /
 *    Get Started behaviour and same `/m/login` destinations.
 *
 * The redesign is gated behind NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED via
 * isMobileRedesignEnabled(), the same flag used by /m/bookings, /m/review,
 * and the new seeker bottom nav. While the flag is off, the legacy carousel
 * is unchanged.
 */

type Slide = {
  img: string;
  alt: string;
  // Legacy fields (Figma 2:594 / 2:660 / 2:705)
  title: string;
  body: string;
  hook: string;
  // Redesign fields (PR-R5, IMG_6537.jpeg). Headline is the bold white line
  // over the photo; segment is the small uppercase strapline above it.
  redesignHeadline: string;
  redesignSegment: string;
  /** When true, render a "COMING SOON" pill on this slide. */
  comingSoon?: boolean;
};

const SLIDES: Slide[] = [
  {
    img: "/m/onboarding/onb1.png",
    alt: "A caregiver looking through a photo album with an older man and his daughter",
    title: "Because Every Moment Matters.",
    body: "At SpecialCarers, we believe care is more than a service — it's a promise. To be present. To uplift. To love with patience.",
    hook: "Welcome to a place where care feels like family.",
    redesignHeadline: "Care that feels like family.",
    redesignSegment: "ELDERLY · COMPANIONSHIP",
  },
  {
    img: "/m/onboarding/onb2.png",
    alt: "A man on his phone, surrounded by a circle of diverse caregiver profiles",
    title: "You're Not Alone in This Journey.",
    body: "We understand the weight of responsibility, the long nights, and the little victories. Whether you're a caregiver or seeking care —",
    hook: "we're here, every step of the way.",
    redesignHeadline: "Patient mentors for growing minds",
    redesignSegment: "TEEN & SEN SUPPORT",
    comingSoon: true,
  },
  {
    img: "/m/onboarding/onb3.png",
    alt: "A hand holding a smartphone with the SpecialCarers app open",
    title: "Let's Bring Compassion to Life.",
    body: "Together, we can create a world where no one feels forgotten, and everyone feels valued. This is more than an app.",
    hook: "It's a lifeline.",
    redesignHeadline: "A lifeline, in the palm of your hand.",
    redesignSegment: "EVERYDAY HELP",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const isLast = idx === SLIDES.length - 1;
  const slide = SLIDES[idx];
  const redesign = isMobileRedesignEnabled();

  const next = () => {
    if (isLast) router.push("/m/login");
    else setIdx(idx + 1);
  };

  if (redesign) {
    return <RedesignedOnboarding slide={slide} idx={idx} isLast={isLast} onNext={next} />;
  }

  return <LegacyOnboarding slide={slide} idx={idx} isLast={isLast} onNext={next} />;
}

/* -------------------------------------------------------------------------- */
/* Legacy layout (flag OFF)                                                   */
/* -------------------------------------------------------------------------- */

function LegacyOnboarding({
  slide,
  idx,
  isLast,
  onNext,
}: {
  slide: Slide;
  idx: number;
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <main className="min-h-[100dvh] bg-white flex flex-col">
      {/* Top bar — brand mark on left, Skip on right */}
      <div className="sc-safe-top px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppLogo size={36} withText={false} tone="plain" />
          <span className="text-primary font-bold text-[15px] tracking-tight">SpecialCarers</span>
        </div>
        <Link
          href="/m/login"
          className="text-primary font-bold text-[14px] px-5 h-9 grid place-items-center rounded-pill border border-line bg-white sc-no-select"
        >
          Skip
        </Link>
      </div>

      {/* Hero illustration */}
      <div className="px-6 mt-4 flex justify-center">
        <div className="relative w-full max-w-[360px] aspect-square">
          {/* Soft mint backdrop */}
          <div
            className="absolute inset-3 bg-primary-50 sc-onb-blob"
            aria-hidden
          />
          <div className="absolute inset-0 sc-onb-blob">
            <Image
              src={slide.img}
              alt={slide.alt}
              fill
              priority={idx === 0}
              sizes="(max-width: 480px) 90vw, 360px"
              className="object-cover"
            />
          </div>
        </div>
      </div>

      {/* Copy */}
      <div className="px-6 mt-8 text-center">
        <h1 className="text-[26px] leading-[1.18] font-bold text-heading">
          {slide.title}
        </h1>
        <p className="mt-4 text-subheading text-[14px] leading-[1.55]">
          {slide.body}{" "}
          <span className="text-secondary font-semibold">{slide.hook}</span>
        </p>
      </div>

      {/* Spacer pushes CTA + dots to the bottom */}
      <div className="flex-1" />

      {/* Page indicators + Next/Get Started */}
      <div className="sc-safe-bottom px-6 pb-6">
        <Dots total={SLIDES.length} current={idx} />
        <div className="mt-6">
          <Button block onClick={onNext} aria-label={isLast ? "Get Started" : "Next"}>
            {isLast ? "Get Started" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Redesigned layout (flag ON) — IMG_6537.jpeg "Phone A"                       */
/* -------------------------------------------------------------------------- */

function RedesignedOnboarding({
  slide,
  idx,
  isLast,
  onNext,
}: {
  slide: Slide;
  idx: number;
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <main
      data-testid="onboarding-redesign"
      className="relative min-h-[100dvh] flex flex-col bg-brand-ink text-white overflow-hidden"
    >
      {/* Full-bleed photo as the screen backdrop */}
      <div className="absolute inset-0">
        <Image
          src={slide.img}
          alt={slide.alt}
          fill
          priority={idx === 0}
          sizes="100vw"
          className="object-cover"
        />
        {/* Bottom-up gradient to make the copy readable. Top stays clean so
            the wordmark and Skip pill don't sit on a wash. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(15,20,22,0) 0%, rgba(15,20,22,0) 38%, rgba(15,20,22,0.55) 70%, rgba(15,20,22,0.9) 100%)",
          }}
        />
      </div>

      {/* Top bar — sits over the photo. Skip button uses a frosted white pill
          so it stays legible against any image. */}
      <div className="sc-safe-top relative z-10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppLogo size={32} withText={false} tone="plain" />
          <span className="text-white font-bold text-[15px] tracking-tight drop-shadow-sm">
            SpecialCarers
          </span>
        </div>
        <Link
          href="/m/login"
          className="text-brand-ink font-bold text-[14px] px-5 h-9 grid place-items-center rounded-pill bg-white/95 backdrop-blur sc-no-select"
        >
          Skip
        </Link>
      </div>

      {/* Push the overlay content to the bottom */}
      <div className="flex-1" />

      {/* Bottom overlay content — wordmark, segment, headline, dots, CTA */}
      <div className="relative z-10 sc-safe-bottom px-6 pb-6">
        {slide.comingSoon && (
          <div className="mb-4">
            <span
              className="inline-block rounded-pill bg-white/15 text-white border border-white/30 backdrop-blur px-4 py-1.5 text-[11px] tracking-[0.18em] font-bold uppercase"
            >
              Coming Soon
            </span>
          </div>
        )}

        <div className="text-center">
          {/* SPECIAL CARERS wordmark with small mark. Center-aligned over
              the photo, exactly as the Phone A design. */}
          <div className="inline-flex items-center gap-2 justify-center">
            <AppLogo size={20} withText={false} tone="plain" />
            <span className="text-white font-bold text-[12px] tracking-[0.22em] uppercase drop-shadow-sm">
              Special Carers
            </span>
          </div>

          <p className="mt-2 text-white/85 text-[11px] tracking-[0.22em] uppercase font-semibold">
            {slide.redesignSegment}
          </p>

          <h1 className="mt-3 text-white text-[28px] leading-[1.15] font-extrabold drop-shadow-md">
            {slide.redesignHeadline}
          </h1>
        </div>

        <div className="mt-6">
          <Dots total={SLIDES.length} current={idx} />
        </div>

        <div className="mt-6">
          <Button block onClick={onNext} aria-label={isLast ? "Get Started" : "Next"}>
            {isLast ? "Get Started" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}
