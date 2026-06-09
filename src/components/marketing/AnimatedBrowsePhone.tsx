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
    avatar: "/brand/avatars/priya.webp",
    name: "Priya Sharma",
    specialty: "Dementia specialist",
    distance: "0.8 mi",
    experience: "8 yrs",
    rate: "£22",
    rating: "4.9",
    reviews: "127",
    verified: true,
    badge: "DBS",
  },
  {
    avatar: "/brand/avatars/sarah.webp",
    name: "Sarah Whitfield",
    specialty: "Live-in companion",
    distance: "1.1 mi",
    experience: "9 yrs",
    rate: "£20",
    rating: "4.9",
    reviews: "96",
    verified: true,
    badge: "DBS",
  },
  {
    avatar: "/brand/avatars/david.webp",
    name: "David Okafor",
    specialty: "Mobility & complex care",
    distance: "1.4 mi",
    experience: "11 yrs",
    rate: "£17",
    rating: "4.8",
    reviews: "84",
    verified: true,
    badge: "NVQ 3",
  },
  {
    avatar: "/brand/avatars/james.webp",
    name: "James Aldridge",
    specialty: "Visiting · Day support",
    distance: "1.8 mi",
    experience: "6 yrs",
    rate: "£16",
    rating: "4.8",
    reviews: "71",
    verified: true,
    badge: "NVQ 2",
  },
  {
    avatar: "/brand/avatars/emma.webp",
    name: "Emma Thompson",
    specialty: "Postnatal · Newborn",
    distance: "2.1 mi",
    experience: "7 yrs",
    rate: "£18",
    rating: "4.9",
    reviews: "62",
    verified: true,
    badge: "RMN",
  },
];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 2.2 + i * 0.14, duration: 0.4, ease: "easeOut" },
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
        <div className="relative h-full w-full rounded-[2.2rem] overflow-hidden bg-[#F4EFE6]">
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

            {/* Search bar + filter button */}
            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex flex-1 items-center gap-1.5 rounded-full bg-white px-2 py-1 ring-1 ring-slate-200 shadow-sm">
                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-slate-400 flex-shrink-0" fill="currentColor" aria-hidden="true">
                  <path d="M7 2a5 5 0 013.9 8.12l3 3a.7.7 0 11-1 1l-3-3A5 5 0 117 2zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
                </svg>
                <span className="text-[7px] text-slate-700 truncate">
                  {typed}
                  <span aria-hidden="true" className="inline-block animate-pulse">▎</span>
                </span>
              </div>
              <button
                type="button"
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[#039EA0] text-white shadow-sm"
                aria-label="Filter"
                tabIndex={-1}
              >
                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-current" aria-hidden="true">
                  <path d="M2 3h12v1.5l-4.5 4.5v4l-3 1.5v-5.5L2 4.5z" />
                </svg>
              </button>
            </div>

            {/* Featured promo banner — teal half + carer-with-child photo half */}
            <div className="mt-2 flex h-12 overflow-hidden rounded-lg shadow-sm">
              <div className="flex flex-1 flex-col justify-center bg-[#039EA0] p-1.5 text-white">
                <h5 className="text-[7px] font-semibold leading-tight">
                  Get high rated
                  <br />
                  Caregivers at
                  <br />
                  your Fingertip
                </h5>
                <button
                  type="button"
                  className="mt-0.5 inline-flex w-fit items-center rounded-full bg-white px-1.5 py-0.5 text-[5.5px] font-bold uppercase tracking-wider text-[#039EA0]"
                  tabIndex={-1}
                >
                  Get Started
                </button>
              </div>
              <div className="relative w-[55%] flex-shrink-0">
                <Image
                  src="/brand/people/carer-with-child.png"
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  style={{ objectPosition: "50% 30%" }}
                />
              </div>
            </div>

            {/* Section heading — bold + dark */}
            <div className="mt-1.5 text-[8px] font-bold text-slate-900">
              Professionals
            </div>
          </div>

          {/* Cards — positioned right under the Professionals heading, compact to fit 5 cards */}
          <div className="absolute inset-x-0 top-[49%] bottom-[7%] z-10 overflow-hidden px-2 space-y-1">
            {caregivers.map((c, i) => (
              <motion.div
                key={`${cycle}-${c.name}`}
                custom={i}
                variants={cardVariants}
                initial={reducedMotion ? "visible" : "hidden"}
                animate={phase === "a" ? "hidden" : "visible"}
                className="relative rounded-lg bg-white px-1.5 py-1 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex items-center gap-1.5">
                  <div className="relative h-6 w-6 flex-shrink-0">
                    <Image
                      src={c.avatar}
                      alt=""
                      fill
                      className="rounded-full object-cover ring-2 ring-white shadow-sm"
                      sizes="24px"
                    />
                    {c.verified && (
                      <div
                        className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#039EA0] ring-1 ring-white"
                        aria-label="Verified"
                      >
                        <svg viewBox="0 0 12 12" className="h-1.5 w-1.5 fill-white" aria-hidden="true">
                          <path d="M10 3.5L5 8.5 2.5 6 1.5 7 5 10.5l5.5-6z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <div className="text-[7px] font-bold text-slate-900 truncate">
                        {c.name}
                      </div>
                      <span className="rounded-sm bg-[#039EA0]/10 px-0.5 text-[4.5px] font-bold uppercase tracking-wider text-[#039EA0]">
                        {c.badge}
                      </span>
                    </div>
                    <div className="text-[5px] text-slate-500 truncate">{c.specialty}</div>
                    <div className="mt-0.5 flex items-center gap-0.5">
                      <svg viewBox="0 0 12 12" className="h-1.5 w-1.5 fill-amber-400" aria-hidden="true">
                        <path d="M6 1l1.5 3.5L11 5l-2.5 2.5L9 11 6 9l-3 2 .5-3.5L1 5l3.5-.5z" />
                      </svg>
                      <span className="text-[5px] font-semibold text-slate-700">{c.rating}</span>
                      <span className="text-[5px] text-slate-400">({c.reviews})</span>
                      <span className="text-[5px] text-slate-300">·</span>
                      <span className="text-[5px] text-slate-500">{c.distance}</span>
                      <span className="text-[5px] text-slate-300">·</span>
                      <span className="text-[5px] text-slate-500">{c.experience}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] font-bold text-slate-900">{c.rate}</div>
                    <div className="text-[4.5px] text-slate-400 uppercase tracking-wider">/hr</div>
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-end">
                  {i === 0 ? (
                    <motion.button
                      type="button"
                      variants={bookPulseVariants}
                      animate={phase === "c" ? "pulse" : "idle"}
                      className="rounded-full bg-[#039EA0] px-1.5 py-0.5 text-[5px] font-semibold uppercase tracking-wider text-white shadow-sm"
                      tabIndex={-1}
                    >
                      Book Slot
                    </motion.button>
                  ) : (
                    <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[5px] font-semibold uppercase tracking-wider text-slate-600">
                      View profile
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
