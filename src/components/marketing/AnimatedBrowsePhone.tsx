"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Animated browse-screen mockup for the Coming Soon section (right phone).
 *
 * Three-phase loop (~9s total, repeats):
 *   Phase A (0–2.2s)  : search bar typewriter — "elderly carer near manchester m20"
 *   Phase B (2.2–5.2s): 3 caregiver cards stagger fade-up
 *   Phase C (5.2–7.5s): top card "Book Slot" pulses + "Booked — Tue 7pm" badge slides in
 *   Phase D (7.5–9.0s): graceful fade-down before restart
 *
 * Uses real homepage caregiver data (Priya Sharma, David Okafor, Emma Thompson).
 */
const SEARCH_QUERY = "elderly carer near manchester m20";
const CYCLE_DURATION = 9000;
const TYPE_DURATION = 1800;
const BOOK_PULSE_START = 5200;
const BADGE_REVEAL = 6000;

const caregivers = [
  {
    initials: "PS",
    name: "Priya Sharma",
    role: "Elderly care · Dementia specialist",
    location: "Manchester, M20",
    experience: "8+ yrs",
    rate: "£22/hr",
    rating: "4.7",
    color: "bg-[#039EA0]",
  },
  {
    initials: "DO",
    name: "David Okafor",
    role: "Eldercare · Dementia-aware",
    location: "Manchester",
    experience: "11 yrs",
    rate: "£17/hr",
    rating: "New",
    color: "bg-violet-500",
  },
  {
    initials: "ET",
    name: "Emma Thompson",
    role: "Maternity nurse · Newborn",
    location: "London",
    experience: "7 yrs",
    rate: "£18/hr",
    rating: "New",
    color: "bg-[#F4A261]",
  },
];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 2.2 + i * 0.18, duration: 0.45, ease: "easeOut" },
  }),
};

const bookPulseVariants: Variants = {
  idle: { scale: 1 },
  pulse: {
    scale: [1, 1.06, 1, 1.04, 1],
    transition: { duration: 0.9, ease: "easeInOut" },
  },
};

const badgeVariants: Variants = {
  hidden: { opacity: 0, x: 8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

function useTypewriter(target: string, durationMs: number, cycleKey: number) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    const stepMs = durationMs / target.length;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setText(target.slice(0, i));
      if (i >= target.length) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [target, durationMs, cycleKey]);
  return text;
}

export function AnimatedBrowsePhone() {
  const reducedMotion = useReducedMotion();
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState<"a" | "b" | "c" | "d">("a");
  const typed = useTypewriter(SEARCH_QUERY, TYPE_DURATION, cycle);

  useEffect(() => {
    if (reducedMotion) {
      setPhase("c");
      return;
    }
    setPhase("a");
    const t1 = window.setTimeout(() => setPhase("b"), TYPE_DURATION + 200);
    const t2 = window.setTimeout(() => setPhase("c"), BOOK_PULSE_START);
    const t3 = window.setTimeout(() => setPhase("d"), CYCLE_DURATION - 800);
    const loop = window.setTimeout(() => setCycle((c) => c + 1), CYCLE_DURATION);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(loop);
    };
  }, [cycle, reducedMotion]);

  const showBadge = phase === "c" || phase === "d";

  return (
    <div
      className="sc-phone-tilt-right relative w-full aspect-[9/19] rotate-[8deg] drop-shadow-2xl"
      role="img"
      aria-label="SpecialCarers browse screen: search results showing vetted caregivers across the UK."
    >
      <div className="relative h-full w-full rounded-[2.4rem] bg-slate-900 p-[3px] ring-1 ring-slate-800">
        <div className="relative h-full w-full rounded-[2.2rem] overflow-hidden bg-white">
          {/* Status bar */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-1.5 text-[8px] font-semibold text-slate-900">
            <span>09:41</span>
          </div>
          {/* Notch */}
          <div
            aria-hidden="true"
            className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-3 rounded-full bg-slate-950 z-30"
          />

          {/* Header */}
          <div className="absolute inset-x-0 top-5 z-20 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="relative h-4 w-4">
                  <Image
                    src="/brand/specialcarer-icon.svg"
                    alt=""
                    fill
                    className="object-contain"
                    sizes="16px"
                  />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-[6px] font-bold uppercase tracking-wider text-slate-500">
                    Special Carers
                  </span>
                  <span className="text-[9px] font-semibold text-slate-900">
                    Eleanor R.
                  </span>
                </div>
              </div>
              <div className="h-4 w-4 rounded-full bg-slate-200 ring-1 ring-slate-300 flex items-center justify-center text-[6px] font-semibold text-slate-600">
                ER
              </div>
            </div>

            {/* Search bar */}
            <div className="mt-2 flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 ring-1 ring-slate-200">
              <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" fill="currentColor">
                <path d="M7 2a5 5 0 013.9 8.12l3 3a.7.7 0 11-1 1l-3-3A5 5 0 117 2zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
              </svg>
              <span className="text-[7px] text-slate-700 truncate">
                {typed}
                <span aria-hidden="true" className="inline-block animate-pulse">▎</span>
              </span>
            </div>

            <h4 className="mt-2 text-[10px] font-bold leading-tight text-slate-900">
              Get high rated
              <br />
              Caregivers at
              <br />
              your fingertips
            </h4>
            <p className="mt-0.5 text-[6px] uppercase tracking-wider text-slate-500">
              Professionals
            </p>
          </div>

          {/* Cards */}
          <div className="absolute inset-x-0 top-[44%] z-10 px-2 space-y-1.5">
            {caregivers.map((c, i) => (
              <motion.div
                key={`${cycle}-${c.initials}`}
                custom={i}
                variants={cardVariants}
                initial={reducedMotion ? "visible" : "hidden"}
                animate={phase === "a" ? "hidden" : "visible"}
                className="relative rounded-lg bg-white px-1.5 py-1 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`h-5 w-5 rounded-full ${c.color} flex items-center justify-center text-[7px] font-semibold text-white ring-2 ring-white shadow-sm`}
                    aria-hidden="true"
                  >
                    {c.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[7px] font-bold text-slate-900 truncate">
                      {c.name}
                    </div>
                    <div className="text-[5px] text-slate-500 truncate">{c.role}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[7px] font-bold text-[#039EA0]">{c.rate}</div>
                    <div className="text-[5px] text-amber-500">★ {c.rating}</div>
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <div className="text-[5px] text-slate-400">
                    {c.location} · {c.experience}
                  </div>
                  {i === 0 ? (
                    <motion.button
                      type="button"
                      variants={bookPulseVariants}
                      animate={phase === "c" ? "pulse" : "idle"}
                      className="rounded-full bg-[#039EA0] px-1.5 py-0.5 text-[5px] font-semibold uppercase tracking-wider text-white"
                      tabIndex={-1}
                    >
                      Book Slot
                    </motion.button>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[5px] font-semibold uppercase tracking-wider text-slate-500">
                      View
                    </span>
                  )}
                </div>
                {/* Booked badge on top card */}
                {i === 0 && (
                  <AnimatePresence>
                    {showBadge && (
                      <motion.div
                        key={`${cycle}-badge`}
                        variants={badgeVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        className="absolute -right-1 -top-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[5px] font-semibold text-white shadow-md ring-1 ring-emerald-600"
                      >
                        <svg viewBox="0 0 12 12" className="h-2 w-2 fill-current" aria-hidden="true">
                          <path d="M10 3.5L5 8.5 2.5 6 1.5 7 5 10.5l5.5-6z" />
                        </svg>
                        Booked · Tue 7pm
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </motion.div>
            ))}
          </div>

          {/* Bottom tab bar */}
          <div className="absolute inset-x-0 bottom-1 z-20 flex items-center justify-around border-t border-slate-100 bg-white/95 px-2 pt-1 pb-1 backdrop-blur">
            {[
              { label: "Home", active: true },
              { label: "Bookings" },
              { label: "Chat" },
              { label: "Review" },
              { label: "Profile" },
            ].map((t) => (
              <div
                key={t.label}
                className={`flex flex-col items-center gap-0.5 ${
                  t.active ? "text-[#039EA0]" : "text-slate-400"
                }`}
              >
                <div className="h-2 w-2 rounded-sm bg-current opacity-80" aria-hidden="true" />
                <span className="text-[5px] font-medium">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnimatedBrowsePhone;
