"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Animated splash-screen mockup for the Coming Soon section (left phone).
 *
 * Replaces the previous flat teal background with a cross-fading photo
 * carousel between two SpecialCarers brand banners (caregivers group +
 * mother & toddler childcare scene). A dark gradient overlay keeps the
 * logo, wordmark, and copy legible across both photos. The headline +
 * sub-copy still animate in sequenced; the photos cross-fade behind.
 *
 * Each photo is on screen for ~5s, with a 1s cross-fade. The text-overlay
 * loop is independent and runs for the full ~10s cycle, so the photo
 * transition does not interrupt the headline sequence.
 *
 * Respects prefers-reduced-motion: shows the first photo + final text
 * composition, no animation timers.
 */
function useClock() {
  const [time, setTime] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      setTime(`${hh}:${mm}`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return time || "—:—";
}

const headlineWords = ["Let's", "Bring", "Compassion", "to", "Life."];
const subLines = [
  "Trusted, vetted caregivers for every",
  "stage of life — from childcare to",
  "live-in support.",
  "This is more than an app, it's a lifeline.",
];

// Photo carousel: each slide pairs a brand banner with the audience it represents.
// Pictures are cropped via object-position to keep the focal subject in the
// portrait phone frame.
const photos = [
  {
    src: "/banners/caregivers/v3/caregivers_v3_1280x480.webp",
    alt: "Three SpecialCarers caregivers chatting on a London street",
    caption: "For families",
    // The subjects in this image are centred horizontally and in the top 60%.
    objectPosition: "50% 35%",
  },
  {
    src: "/banners/childcare/v1/childcare_v1_1280x480.webp",
    alt: "A caregiver and toddler playing with wooden blocks in a sunlit living room",
    caption: "Trusted childcare",
    objectPosition: "55% 40%",
  },
] as const;

const PHOTO_HOLD = 5; // seconds per slide
const LOOP_DURATION = photos.length * PHOTO_HOLD; // 10s full carousel

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, when: "beforeChildren" },
  },
  exit: { opacity: 0, transition: { duration: 0.7, delay: LOOP_DURATION - 1 } },
};

const handsVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: "easeOut" } },
};

const rippleVariants: Variants = {
  hidden: { opacity: 0, scale: 1 },
  visible: (i: number) => ({
    opacity: [0, 0.4, 0],
    scale: [1, 1.6, 1.8],
    transition: { duration: 1.6, delay: 0.4 + i * 0.2, ease: "easeOut" },
  }),
};

const wordmarkVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { delay: 0.8, duration: 0.5, ease: "easeOut" } },
};

const headlineWordVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 1.6 + i * 0.18, duration: 0.5, ease: "easeOut" },
  }),
};

const subLineVariants: Variants = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { delay: 3.2 + i * 0.2, duration: 0.5 },
  }),
};

const captionVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.4 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.4 } },
};

export function AnimatedSplashPhone() {
  const reducedMotion = useReducedMotion();
  const clock = useClock();
  const [cycle, setCycle] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);

  // Photo carousel timer (independent of text loop)
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setPhotoIdx((i) => (i + 1) % photos.length);
    }, PHOTO_HOLD * 1000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // Text-sequence loop
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setCycle((c) => c + 1), LOOP_DURATION * 1000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const currentPhoto = photos[photoIdx];

  return (
    <div
      className="sc-phone-tilt-left relative w-full aspect-[9/19] rotate-[-14deg] drop-shadow-2xl"
      role="img"
      aria-label="SpecialCarers splash screen showcasing caregivers and childcare scenes with the tagline Let's Bring Compassion to Life."
    >
      <div className="relative h-full w-full rounded-[2.4rem] bg-slate-900 p-[3px] ring-1 ring-slate-800">
        <div className="relative h-full w-full rounded-[2.2rem] overflow-hidden bg-slate-900">
          {/* Photo carousel (z-0) */}
          <div className="absolute inset-0 z-0">
            <AnimatePresence initial={false} mode="sync">
              <motion.div
                key={currentPhoto.src}
                initial={reducedMotion ? false : { opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ opacity: { duration: 1.0 }, scale: { duration: 5.5, ease: "easeOut" } }}
                className="absolute inset-0"
              >
                <Image
                  src={currentPhoto.src}
                  alt={currentPhoto.alt}
                  fill
                  priority={photoIdx === 0}
                  className="object-cover"
                  style={{ objectPosition: currentPhoto.objectPosition }}
                  sizes="(max-width: 768px) 50vw, 240px"
                />
                {/* Slide caption pill */}
                <motion.div
                  key={`caption-${currentPhoto.src}`}
                  variants={captionVariants}
                  initial={reducedMotion ? false : "initial"}
                  animate="animate"
                  exit="exit"
                  className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm ring-1 ring-white/20"
                >
                  {currentPhoto.caption}
                </motion.div>
              </motion.div>
            </AnimatePresence>
            {/* Readability scrim — darker at top + bottom, lighter in the middle so faces stay clear */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/15 to-black/65"
            />
            {/* Brand tint to keep things cohesive */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[#039EA0] mix-blend-multiply opacity-25"
            />
          </div>

          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-1.5 text-[8px] font-semibold text-white drop-shadow">
            <span>{clock}</span>
          </div>
          {/* Notch */}
          <div
            aria-hidden="true"
            className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-3 rounded-full bg-slate-950 z-30"
          />

          {/* Animated text content (z-10, over the photo) */}
          <motion.div
            key={cycle}
            initial={reducedMotion ? false : "hidden"}
            animate="visible"
            variants={containerVariants}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 pt-8 pb-10 text-white"
          >
            {/* Hands graphic with ripples */}
            <div className="relative mb-3 flex h-[34%] w-full items-center justify-center">
              {!reducedMotion &&
                [0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    custom={i}
                    variants={rippleVariants}
                    className="absolute h-16 w-16 rounded-full border-2 border-white/70"
                    aria-hidden="true"
                  />
                ))}
              <motion.div
                variants={handsVariants}
                className="relative h-full w-full"
              >
                <Image
                  src="/brand/specialcarer-icon.svg"
                  alt=""
                  fill
                  className="object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                  sizes="(max-width: 768px) 25vw, 120px"
                />
              </motion.div>
            </div>

            {/* Wordmark */}
            <motion.div
              variants={wordmarkVariants}
              className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
            >
              Special Carers
            </motion.div>

            {/* Headline */}
            <h3 className="text-center text-[14px] font-bold leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
              {headlineWords.map((word, i) => (
                <motion.span
                  key={`${cycle}-${i}-${word}`}
                  custom={i}
                  variants={headlineWordVariants}
                  className="inline-block mr-1"
                >
                  {word}
                </motion.span>
              ))}
            </h3>

            {/* Sub-copy */}
            <div className="mt-2 text-center text-[8px] leading-snug text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
              {subLines.map((line, i) => (
                <motion.p
                  key={`${cycle}-sub-${i}`}
                  custom={i}
                  variants={subLineVariants}
                >
                  {line}
                </motion.p>
              ))}
            </div>
          </motion.div>

          {/* Skip button */}
          <button
            type="button"
            className="absolute bottom-3 right-3 z-20 rounded-full bg-white/15 px-2.5 py-1 text-[7px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm ring-1 ring-white/30"
            aria-label="Skip splash"
            tabIndex={-1}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

export default AnimatedSplashPhone;
