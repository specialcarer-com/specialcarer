"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppLogo, Button, Dots } from "../_components/ui";

/**
 * Three-screen onboarding carousel.
 *
 * Figma: 2:594 / 2:660 / 2:705. Headline + 3-line body where the third
 * line is brand-navy ("hook line"). Skip → /m/login. Next → next slide,
 * Get Started on slide 3 → /m/login.
 *
 * Image is masked to a soft organic blob (.sc-onb-blob in mobile.css)
 * with a faint mint background tint behind it, matching the Figma look.
 */

type Slide = {
  img: string;
  alt: string;
  title: string;
  body: string;
  hook: string;
};

const SLIDES: Slide[] = [
  {
    img: "/m/onboarding/onb1.png",
    alt: "A caregiver looking through a photo album with an older man and his daughter",
    title: "Because Every Moment Matters.",
    body: "At SpecialCarer, we believe care is more than a service — it's a promise. To be present. To uplift. To love with patience.",
    hook: "Welcome to a place where care feels like family.",
  },
  {
    img: "/m/onboarding/onb2.png",
    alt: "A man on his phone, surrounded by a circle of diverse caregiver profiles",
    title: "You're Not Alone in This Journey.",
    body: "We understand the weight of responsibility, the long nights, and the little victories. Whether you're a caregiver or seeking care —",
    hook: "we're here, every step of the way.",
  },
  {
    img: "/m/onboarding/onb3.png",
    alt: "A hand holding a smartphone with the SpecialCarer app open",
    title: "Let's Bring Compassion to Life.",
    body: "Together, we can create a world where no one feels forgotten, and everyone feels valued. This is more than an app.",
    hook: "It's a lifeline.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const isLast = idx === SLIDES.length - 1;
  const slide = SLIDES[idx];

  const next = () => {
    if (isLast) router.push("/m/login");
    else setIdx(idx + 1);
  };

  return (
    <main className="min-h-[100dvh] bg-white flex flex-col">
      {/* Top bar — brand mark on left, Skip on right */}
      <div className="sc-safe-top px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppLogo size={36} withText={false} tone="plain" />
          <span className="text-primary font-bold text-[15px] tracking-tight">SpecialCarer</span>
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
          <Button block onClick={next} aria-label={isLast ? "Get Started" : "Next"}>
            {isLast ? "Get Started" : "Next"}
          </Button>
        </div>
      </div>
    </main>
  );
}
