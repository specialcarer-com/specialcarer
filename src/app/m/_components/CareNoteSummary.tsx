"use client";

/**
 * Gap 29: family-facing "Key points" AI summary block for a care-journal note.
 *
 * Three states:
 *   1. summary present → render the "Key points" bullets with a teal ✨ sparkle,
 *      and the full note collapsed behind a "Show full note" toggle.
 *   2. no summary + long note → "Summarising…" shimmer, and poll the summarise
 *      endpoint a few times so the bullets appear without a page reload (the
 *      save trigger is fire-and-forget, so the row lands shortly after save).
 *   3. no summary + short note → nothing AI, just the note body.
 */

import { useEffect, useState } from "react";

const SPARKLE = "✨";
/** Keep in sync with JOURNAL_SUMMARY_MIN_CHARS / MIN_SUMMARY_CHARS. */
const MIN_SUMMARY_CHARS = 200;
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 6;

/** Render a markdown-ish bullet list ("- " lines) as <li>s. */
function bulletLines(summary: string): string[] {
  return summary
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s?/, "").trim())
    .filter((l) => l.length > 0);
}

function KeyPoints({ summary }: { summary: string }) {
  const points = bulletLines(summary);
  return (
    <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span aria-hidden className="text-primary text-[13px] leading-none">
          {SPARKLE}
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wide text-primary">
          Key points
        </span>
      </div>
      <ul className="list-disc pl-4 space-y-1 text-[13px] text-heading leading-relaxed">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Summarising() {
  return (
    <div
      className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3"
      aria-live="polite"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span aria-hidden className="text-primary text-[13px] leading-none">
          {SPARKLE}
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wide text-primary">
          Summarising…
        </span>
      </div>
      <div className="space-y-1.5" aria-hidden>
        <div className="h-2.5 w-11/12 rounded bg-primary/15 animate-pulse" />
        <div className="h-2.5 w-9/12 rounded bg-primary/15 animate-pulse" />
        <div className="h-2.5 w-7/12 rounded bg-primary/15 animate-pulse" />
      </div>
    </div>
  );
}

export function CareNoteSummary({
  noteId,
  body,
  initialSummary,
}: {
  noteId: string;
  body: string;
  initialSummary: string | null;
}) {
  const isLong = body.trim().length >= MIN_SUMMARY_CHARS;
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [expanded, setExpanded] = useState(false);

  // Poll for a pending summary (long note, none yet). The save trigger is
  // fire-and-forget, so the row usually appears within a few seconds.
  useEffect(() => {
    if (summary || !isLong) return;
    let cancelled = false;
    let polls = 0;

    const tick = async () => {
      polls += 1;
      try {
        const res = await fetch(
          `/api/m/care-notes/${encodeURIComponent(noteId)}/summarise`,
          { method: "POST" },
        );
        if (res.ok) {
          const data = (await res.json()) as { summary?: string | null };
          if (!cancelled && data.summary) {
            setSummary(data.summary);
            return; // stop polling
          }
        }
      } catch {
        // transient — keep polling until MAX_POLLS
      }
      if (!cancelled && polls < MAX_POLLS) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    let timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [noteId, summary, isLong]);

  // Short note with no summary: nothing AI, render the body plainly.
  if (!isLong && !summary) {
    return (
      <p className="text-[14px] text-heading whitespace-pre-wrap leading-relaxed">
        {body}
      </p>
    );
  }

  return (
    <div>
      {summary ? <KeyPoints summary={summary} /> : <Summarising />}

      {expanded ? (
        <p className="text-[14px] text-heading whitespace-pre-wrap leading-relaxed">
          {body}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[13px] font-semibold text-primary"
          aria-expanded={false}
        >
          Show full note
        </button>
      )}
    </div>
  );
}
