"use client";

import { useEffect, useState } from "react";
import {
  SERVICE_TYPE_LABEL,
  WEEKDAY_LABEL,
  type ScheduleSuggestion,
} from "@/lib/ai/types";

/**
 * Recurring-booking suggestion banner. Reads /api/ai/schedule-suggestions
 * once on mount; if any pending suggestion ≥0.5 confidence is found,
 * shows the top one with Accept / Dismiss buttons. Renders nothing if
 * the endpoint 401s, errors, or returns no suggestions.
 */
export default function RecurringSuggestionBanner() {
  const [s, setS] = useState<ScheduleSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/schedule-suggestions", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as { suggestions?: ScheduleSuggestion[] };
        const top = j.suggestions?.[0] ?? null;
        if (!cancelled) setS(top);
      } catch {
        /* silent — banner must not block the page */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(status: "accepted" | "dismissed") {
    if (!s) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/ai/schedule-suggestions/${s.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Action failed.");
        return;
      }
      setS(null);
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;

  const dayLabel = WEEKDAY_LABEL[s.weekday] ?? "this day";
  const hourStr = formatHour(s.hour);
  const serviceLabel =
    SERVICE_TYPE_LABEL[s.service_type] ?? s.service_type.replace(/_/g, " ");

  return (
    <div
      role="region"
      aria-label="Recurring booking suggestion"
      className="rounded-2xl border border-brand-100 bg-brand-50 p-4 sm:p-5 flex flex-wrap items-center gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-700">
          You usually book {serviceLabel} on {dayLabel} around {hourStr}
        </p>
        <p className="text-xs text-slate-700 mt-0.5">
          Want to set this up as a recurring booking? Confidence{" "}
          {Math.round(s.confidence * 100)}% · based on {s.occurrences} past
          bookings.
        </p>
        {err && (
          <p aria-live="polite" className="mt-1 text-xs text-rose-700">
            {err}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => act("dismissed")}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 disabled:opacity-60"
        >
          Dismiss
        </button>
        <button
          onClick={() => act("accepted")}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : "Set up recurring"}
        </button>
      </div>
    </div>
  );
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}
