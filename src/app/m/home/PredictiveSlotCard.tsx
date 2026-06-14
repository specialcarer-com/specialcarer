"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { serviceLabel } from "@/lib/care/services";
import type { UsualSlot } from "@/lib/predictions/usualSlot";

/**
 * Predictive "usual time" tile (gap 23).
 *
 * Fetches the seeker's detected recurring slot from
 * /api/m/predictions/usual-slot on mount. When the API returns a slot we
 * show a one-tap rebook prompt ("Book Sarah again — usually Tuesday at
 * 9am?"); a 204 (no qualifying history) renders nothing.
 */

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "9am" / "2pm" / "12pm" — friendly hour label for the prompt copy. */
function hourLabel(hour24: number): string {
  const period = hour24 >= 12 ? "pm" : "am";
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12}${period}`;
}

/**
 * ISO timestamp for the next occurrence of `dayOfWeek` at `startHour`,
 * strictly in the future, computed in UTC to match the detection heuristic.
 */
export function nextOccurrenceISO(
  dayOfWeek: number,
  startHour: number,
  from: Date = new Date(),
): string {
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      startHour,
      0,
      0,
      0,
    ),
  );
  let delta = (dayOfWeek - d.getUTCDay() + 7) % 7;
  if (delta === 0 && d.getTime() <= from.getTime()) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString();
}

export default function PredictiveSlotCard() {
  const [slot, setSlot] = useState<UsualSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/predictions/usual-slot", {
          credentials: "include",
          cache: "no-store",
        });
        // 204 (no slot) and any error → render nothing.
        if (res.status !== 200) return;
        const json = (await res.json()) as UsualSlot;
        if (!cancelled) setSlot(json);
      } catch {
        /* render nothing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!slot) return null;

  const startsAt = nextOccurrenceISO(slot.dayOfWeek, slot.startHour);
  const href =
    `/m/book/${slot.carerId}` +
    `?service=${encodeURIComponent(slot.serviceType)}` +
    `&startsAt=${encodeURIComponent(startsAt)}`;
  const when = `${DAY_NAMES[slot.dayOfWeek]} at ${hourLabel(slot.startHour)}`;

  return (
    <div className="px-4 pt-3">
      <Link href={href} className="block sc-no-select">
        <div
          className="rounded-card p-4 flex items-center gap-3"
          style={{
            background:
              "linear-gradient(135deg, rgba(3,158,160,0.10) 0%, rgba(23,30,84,0.06) 100%)",
            border: "1px solid rgba(3,158,160,0.20)",
          }}
        >
          <span
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-white text-[18px]"
            aria-hidden
          >
            🔁
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-heading">
              Book {slot.carerName} again?
            </p>
            <p className="text-[12px] text-subheading">
              Your usual {serviceLabel(slot.serviceType)} — {when}.
            </p>
          </div>
          <span className="text-primary font-bold text-[13px] flex-none">
            Rebook
          </span>
        </div>
      </Link>
    </div>
  );
}
