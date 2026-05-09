"use client";

/**
 * Live ETA countdown for the seeker / family viewer. Polls every 60 s
 * — server-side caching means even a faster client poll wouldn't yield
 * fresher numbers, so 60 s matches the cache TTL exactly.
 *
 * Hidden once the carer has arrived (booking is in_progress); the
 * parent flips that case to a "Arrived at HH:MM" line instead.
 */

import { useEffect, useState } from "react";
import { Card } from "../../../_components/ui";
import { formatEta } from "@/lib/tracking/eta-format";

const POLL_MS = 60_000;

export default function EtaCard({ bookingId }: { bookingId: string }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/tracking/${bookingId}/eta`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const json = (await res.json()) as {
          eta_seconds: number | null;
        };
        if (cancelled) return;
        setSeconds(json.eta_seconds);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bookingId]);

  // Only render once we've heard back at least once. If the API
  // returns null (no session yet, or no destination cached) we hide
  // the card entirely rather than shipping an empty state.
  if (!loaded || seconds == null) return null;
  const formatted = formatEta(seconds);
  if (!formatted) return null;

  return (
    <Card className="p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
        Carer ETA
      </p>
      <p className="mt-1 text-[28px] font-extrabold text-heading leading-tight">
        {formatted}
      </p>
      <p className="mt-1 text-[12px] text-subheading">
        Refreshes every minute while the carer is on the way.
      </p>
    </Card>
  );
}
