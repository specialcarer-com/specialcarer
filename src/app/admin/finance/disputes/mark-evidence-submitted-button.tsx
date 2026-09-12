"use client";

import { useState } from "react";

/**
 * Inline action button that posts to /api/admin/finance/disputes/[id]/evidence
 * and reloads on success so the server component recomputes the badge.
 *
 * Records ONLY the state transition to `evidence_submitted` in our
 * `stripe_dispute_cases` row — the actual evidence file upload happens
 * in the Stripe dashboard, which is deep-linked from the parent page.
 * See PR body's "Evidence source of truth" note.
 */
export default function MarkEvidenceSubmittedButton({
  caseId,
}: {
  caseId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/finance/disputes/${caseId}/evidence`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && body.ok) {
        window.location.reload();
        return;
      }
      setError(body.error ?? `HTTP ${res.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Marking…" : "Mark evidence submitted"}
      </button>
      {error ? (
        <span className="text-[11px] text-rose-700">{error}</span>
      ) : null}
    </div>
  );
}
