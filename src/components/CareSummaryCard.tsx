"use client";

import { useEffect, useState } from "react";
import type { CareSummary, MoodTrend } from "@/lib/ai/types";

/**
 * "Daily summary" card — fetches the most recent booking-scope summary
 * from /api/ai/summaries. If none exists, shows a "Generate now" button
 * that POSTs to /api/ai/summarize.
 */
type Props = {
  bookingId: string;
};

const MOOD_TONE: Record<MoodTrend, string> = {
  positive: "bg-emerald-50 text-emerald-800 border-emerald-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  mixed: "bg-amber-50 text-amber-800 border-amber-200",
  concern: "bg-rose-50 text-rose-800 border-rose-200",
};

export default function CareSummaryCard({ bookingId }: Props) {
  const [summary, setSummary] = useState<CareSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ai/summaries?booking_id=${encodeURIComponent(bookingId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const j = (await res.json()) as { summary: CareSummary | null };
        if (!cancelled) {
          setSummary(j.summary);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function generate() {
    setGenerating(true);
    setErr(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Could not generate.");
        return;
      }
      const j = (await res.json()) as { summary: CareSummary | null };
      setSummary(j.summary);
    } finally {
      setGenerating(false);
    }
  }

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4" aria-live="polite" aria-busy="true">
        <p className="text-xs text-slate-400">Loading summary…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3"
        aria-live="polite"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">Daily summary</p>
          <p className="text-xs text-slate-500 mt-0.5">
            No summary yet for this booking.
          </p>
          {err && (
            <p aria-live="assertive" className="text-xs text-rose-700 mt-1">
              {err}
            </p>
          )}
        </div>
        <button
          onClick={generate}
          disabled={generating}
          aria-label={generating ? "Generating summary, please wait" : "Generate care summary now"}
          className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-semibold disabled:opacity-60"
        >
          {generating ? "Generating…" : "Generate now"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Daily summary
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {summary.headline}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${MOOD_TONE[summary.mood_trend]}`}
        >
          {summary.mood_trend}
        </span>
      </div>

      {summary.bullets.length > 0 && (
        <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-700">
          {summary.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {summary.flags.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs font-semibold text-amber-900">Flags</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5 text-xs text-amber-900/90">
            {summary.flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Computed {new Date(summary.computed_at).toLocaleString("en-GB")}
        </span>
        <button
          onClick={generate}
          disabled={generating}
          aria-label={generating ? "Refreshing summary, please wait" : "Refresh care summary"}
          className="text-brand-700 font-semibold hover:underline disabled:opacity-60"
        >
          {generating ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
