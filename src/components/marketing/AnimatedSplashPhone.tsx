"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Animated splash-screen mockup for the Coming Soon section (left phone).
 *
 * Sequence (loops every ~9.5s):
 *   0.0–0.6s : hands icon fades + scales in
 *   0.4–1.6s : 3 concentric ripples emanate from behind the hands
 *   0.8–1.6s : "Special Carers" wordmark slides up
 *   1.6–3.2s : "Let's Bring Compassion to Life." headline staggers in
 *   3.2–4.2s : sub-copy paragraph fades in line by line
 *   4.2–8.5s : hold
 *   8.5–9.5s : fade out + loop
 *
 * Respects prefers-reduced-motion: renders the final static composition.
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
  "Together, we can create a world where",
  "no one feels forgotten, and everyone",
  "feels valued.",
  "This is more than an app, it's a lifeline.",
];

const LOOP_DURATION = 9.5; // seconds

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, when: "beforeChildren" },
  },
  exit: { opacity: 0, transition: { duration: 0.7, delay: 8.5 } },
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

export function AnimatedSplashPhone() {
  const reducedMotion = useReducedMotion();
  const clock = useClock();
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setCycle((c) => c + 1), LOOP_DURATION * 1000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return (
    <div
      className="sc-phone-tilt-left relative w-full aspect-[9/19] rotate-[-14deg] drop-shadow-2xl"
      role="img"
      aria-label="SpecialCarers splash screen: hands sheltering family, Let's Bring Compassion to Life."
    >
      <div className="relative h-full w-full rounded-[2.4rem] bg-slate-900 p-[3px] ring-1 ring-slate-800">
        <div className="relative h-full w-full rounded-[2.2rem] overflow-hidden bg-[#039EA0]">
          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-1.5 text-[8px] font-semibold text-white">
            <span>{clock}</span>
          </div>
          {/* Notch */}
          <div
            aria-hidden="true"
            className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-3 rounded-full bg-slate-950 z-30"
          />

          {/* Animated content */}
          <motion.div
            key={cycle}
            initial={reducedMotion ? false : "hidden"}
            animate="visible"
            variants={containerVariants}
            className="absolute inset-0 flex flex-col items-center justify-center px-4 pt-8 pb-10 text-white"
          >
            {/* Hands graphic with ripples */}
            <div className="relative mb-3 flex h-[42%] w-full items-center justify-center">
              {!reducedMotion &&
                [0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    custom={i}
                    variants={rippleVariants}
                    className="absolute h-20 w-20 rounded-full border-2 border-white/70"
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
                  className="object-contain drop-shadow-md"
                  sizes="(max-width: 768px) 25vw, 120px"
                />
              </motion.div>
            </div>

            {/* Wordmark */}
            <motion.div
              variants={wordmarkVariants}
              className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              Special Carers
            </motion.div>

            {/* Headline */}
            <h3 className="text-center text-[14px] font-bold leading-tight">
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
            <div className="mt-2 text-center text-[8px] leading-snug text-white/90">
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
