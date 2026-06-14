"use client";

/**
 * Tip of the day (gap 46) — a rotating strip on the carer dashboard.
 *
 * Picks one tip per calendar day (UTC) from CARER_TIPS via the pure
 * `tipIndexForDate` helper, so every carer sees the same tip on a given
 * day. A timer recomputes the index at the next UTC midnight, so the tip
 * refreshes even if the dashboard is left open. No backend needed.
 *
 * Brand styling: teal accent (#039EA0) on a cream card (#F4EFE6), matching
 * the rest of the carer home surface.
 */

import { useEffect, useState } from "react";
import { CARER_TIPS } from "@/lib/tips/carerTips";
import { tipIndexForDate } from "@/lib/tips/selectTip";

const TEAL = "#039EA0";
const CREAM = "#F4EFE6";

function msUntilNextUtcMidnight(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return next - now.getTime();
}

export default function TipOfTheDay() {
  // Index of today's tip; a timer bumps it at the next UTC midnight so the
  // tip refreshes for carers who leave the page open.
  const [index, setIndex] = useState(() =>
    tipIndexForDate(new Date(), CARER_TIPS.length),
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timer = setTimeout(() => {
        setIndex(tipIndexForDate(new Date(), CARER_TIPS.length));
        scheduleNext();
      }, msUntilNextUtcMidnight(new Date()) + 1000);
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  const tip = CARER_TIPS[index];
  const number = index + 1;
  const total = CARER_TIPS.length;

  return (
    <div className="px-4 pt-4">
      <div
        className="rounded-card shadow-card p-4 border"
        style={{ background: CREAM, borderColor: "rgba(3,158,160,0.20)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-pill px-3 h-7 text-[11px] font-bold"
          style={{ background: "rgba(3,158,160,0.12)", color: TEAL }}
        >
          <span aria-hidden>💡</span>
          Tip
        </span>

        <p className="mt-3 text-[14px] leading-relaxed text-heading">
          {tip.body}
        </p>

        <p className="mt-3 text-[11px] font-semibold" style={{ color: TEAL }}>
          Tip {number} of {total}
        </p>
      </div>
    </div>
  );
}
