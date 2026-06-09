"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
// AnimatePresence still used for the caption text below.
import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Animated splash mockup for the Coming Soon section (left phone).
 *
 * Hero photo cross-fade between two brand portraits — the team group shot
 * (carers + family) and the carer-with-child childcare scene. The photo is
 * the dominant content; brand chrome (logo + wordmark + caption) sits in a
 * compact strip at the bottom and a tiny logomark at the top so the people
 * in the photo are never covered by overlays.
 *
 * Two independent loops:
 *   - Photo: cross-fade every 4.5s
 *   - Caption: matches the active photo (the caption is part of the photo
 *     transition, so the bottom strip text changes with the image)
 *
 * Respects prefers-reduced-motion: shows the first photo + caption, no
 * timers.
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

// Portraits paired with the audience message they communicate.
const slides = [
  {
    src: "/brand/people/team-splash.png",
    alt: "A SpecialCarers team standing with an elderly couple at home",
    eyebrow: "Care for the whole family",
    headline: "Trusted, vetted carers",
    objectPosition: "50% 30%",
  },
  {
    src: "/brand/people/carer-with-child.png",
    alt: "A caregiver smiling with a young child colouring at a kitchen table",
    eyebrow: "Childcare you can trust",
    headline: "Loving, qualified nannies",
    objectPosition: "50% 35%",
  },
  {
    src: "/brand/people/wheelchair-care.png",
    alt: "A caregiver and an elderly man in a wheelchair smiling together in a garden",
    eyebrow: "Mobility & complex care",
    headline: "Compassion, dignity, independence",
    objectPosition: "55% 35%",
  },
  {
    src: "/brand/people/teen-support.png",
    alt: "A support worker helping two teenagers with homework at a kitchen table",
    eyebrow: "Teen & SEN support",
    headline: "Patient mentors for growing minds",
    objectPosition: "55% 40%",
  },
] as const;

const SLIDE_HOLD = 4.5; // seconds per slide
const CROSSFADE = 1.4; // overlap duration — longer is smoother, never blank

const captionTextVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.3 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.3 } },
};

export function AnimatedSplashPhone() {
  const reducedMotion = useReducedMotion();
  const clock = useClock();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % slides.length);
    }, SLIDE_HOLD * 1000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const slide = slides[idx];

  return (
    <div
      className="sc-phone-tilt-left relative w-full aspect-[9/19] rotate-[-14deg] drop-shadow-2xl"
      role="img"
      aria-label="SpecialCarers app preview: trusted carers for families and childcare."
    >
      <div className="relative h-full w-full rounded-[2.4rem] bg-slate-900 p-[3px] ring-1 ring-slate-800">
        <div className="relative h-full w-full rounded-[2.2rem] overflow-hidden bg-slate-900">
          {/* Hero photo carousel — all slides preloaded and stacked, opacity-driven cross-fade so there is never a blank frame */}
          <div className="absolute inset-0 z-0">
            {slides.map((s, i) => (
              <motion.div
                key={s.src}
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: i === idx ? 1 : 0 }}
                transition={{ duration: reducedMotion ? 0 : CROSSFADE, ease: "easeInOut" }}
                aria-hidden={i === idx ? "false" : "true"}
              >
                <Image
                  src={s.src}
                  alt={i === idx ? s.alt : ""}
                  fill
                  priority={i === 0}
                  className="object-cover"
                  style={{ objectPosition: s.objectPosition }}
                  sizes="(max-width: 768px) 50vw, 240px"
                />
              </motion.div>
            ))}

            {/* Bottom gradient — keeps the caption strip readable without covering faces */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/80 via-black/30 to-transparent"
            />
            {/* Top gradient — just enough for the status bar */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[14%] bg-gradient-to-b from-black/55 to-transparent"
            />
          </div>

          {/* Status bar (top) */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-1.5 text-[8px] font-semibold text-white">
            <span>{clock}</span>
            <span className="opacity-90">SpecialCarers</span>
          </div>
          {/* Notch */}
          <div
            aria-hidden="true"
            className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-3 rounded-full bg-slate-950 z-30"
          />

          {/* Tiny logomark — top-left corner under the notch, does not cover the photo subject */}
          <div className="absolute top-5 left-3 z-20 flex h-6 w-6 items-center justify-center rounded-md bg-white/15 backdrop-blur-sm ring-1 ring-white/30">
            <Image
              src="/brand/specialcarer-icon.svg"
              alt=""
              width={16}
              height={16}
              className="opacity-95"
            />
          </div>

          {/* Caption strip — fixed at the bottom, content changes with the slide */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-5 pt-4 text-white">
            {/* SPECIAL CARERS brand tag — prominent above the rotating caption */}
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 backdrop-blur-sm ring-1 ring-white/30">
              <Image
                src="/brand/specialcarer-icon.svg"
                alt=""
                width={10}
                height={10}
                className="opacity-95"
              />
              <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                Special Carers
              </span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`caption-${slide.src}`}
                variants={captionTextVariants}
                initial={reducedMotion ? false : "initial"}
                animate="animate"
                exit="exit"
              >
                <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/85">
                  {slide.eyebrow}
                </div>
                <h3 className="mt-1 text-[13px] font-bold leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                  {slide.headline}
                </h3>
              </motion.div>
            </AnimatePresence>

            {/* Pagination dots */}
            <div className="mt-3 flex items-center gap-1.5">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === idx
                      ? "h-1 w-4 rounded-full bg-white"
                      : "h-1 w-1 rounded-full bg-white/50"
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnimatedSplashPhone;
