"use client";

/**
 * Tip of the day (gap 46) — a rotating strip on the carer dashboard.
 *
 * Picks one tip per calendar day (UTC) from CARER_TIPS via the pure
 * `selectTipForDate` helper, so every carer sees the same tip on a given
 * day and it refreshes automatically at midnight UTC. No backend needed.
 *
 * Brand styling: teal accent (#039EA0) on a cream card (#F4EFE6), matching
 * the rest of the carer home surface.
 */

import { useMemo } from "react";
import { CARER_TIPS } from "@/lib/tips/carerTips";
import { selectTipForDate } from "@/lib/tips/selectTip";

const TEAL = "#039EA0";
const CREAM = "#F4EFE6";

export default function TipOfTheDay() {
  const { tip, number, total } = useMemo(() => {
    const t = selectTipForDate(new Date(), CARER_TIPS);
    const idx = CARER_TIPS.findIndex((x) => x.id === t.id);
    return { tip: t, number: idx + 1, total: CARER_TIPS.length };
  }, []);

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
