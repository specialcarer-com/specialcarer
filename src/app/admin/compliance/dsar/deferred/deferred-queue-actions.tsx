"use client";

import { useState } from "react";
import {
  canManuallyRetry,
  canManuallySkip,
  type DeferredQueueViewRow,
} from "@/lib/dsar/deferred-queue-view";

type ActionKind = "retry" | "skip";

/**
 * Inline per-row action cell for the deferred-erasure queue.
 *
 * Two buttons — "Retry" and "Skip" — each opens a small confirm
 * bubble that captures an optional note (audit-only, max 500 chars).
 * Both post to `POST /api/admin/dsar/deferred/[id]` and reload the
 * page on success so the row's badge updates.
 */
export default function DeferredQueueActions({
  row,
  today,
}: {
  row: DeferredQueueViewRow;
  today: string;
}) {
  const showRetry = canManuallyRetry(row, today);
  const showSkip = canManuallySkip(row);

  const [open, setOpen] = useState<ActionKind | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!showRetry && !showSkip) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  async function submit(action: ActionKind) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/dsar/deferred/${row.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          notes: notes.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (res.ok && body.ok) {
        // Full reload — the server component recomputes badges +
        // summary counts. Cheaper than plumbing a client-side cache.
        window.location.reload();
        return;
      }
      setErrorMsg(
        body.error
          ? body.detail
            ? `${body.error}: ${body.detail}`
            : body.error
          : `HTTP ${res.status}`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      {showRetry && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-teal-300 text-teal-800 hover:bg-teal-50"
          onClick={() => {
            setOpen(open === "retry" ? null : "retry");
            setErrorMsg(null);
            setNotes("");
          }}
        >
          Retry
        </button>
      )}
      {showSkip && (
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
          onClick={() => {
            setOpen(open === "skip" ? null : "skip");
            setErrorMsg(null);
            setNotes("");
          }}
        >
          Skip
        </button>
      )}

      {open && (
        <div className="w-full mt-1 rounded-md border border-slate-200 bg-white p-2 space-y-2">
          <div className="text-xs text-slate-600">
            {open === "retry" ? (
              <>
                Reset this row to <code>pending</code>. The next cron
                tick (04:00 UTC) will re-execute the queued action.
              </>
            ) : (
              <>
                Mark this row <code>skipped</code>. This is permanent
                and audited — use only if the underlying record has
                already been removed through another channel.
              </>
            )}
          </div>
          <textarea
            className="w-full border border-slate-200 rounded p-1 text-xs"
            rows={2}
            maxLength={500}
            placeholder="Optional audit note (500 chars max)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {errorMsg && (
            <div className="text-xs text-rose-700">{errorMsg}</div>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              className={`text-xs px-2 py-1 rounded ${
                open === "retry"
                  ? "bg-teal-600 text-white hover:bg-teal-700"
                  : "bg-slate-800 text-white hover:bg-slate-900"
              } disabled:opacity-50`}
              disabled={busy}
              onClick={() => submit(open)}
            >
              {busy
                ? "Working…"
                : open === "retry"
                  ? "Confirm retry"
                  : "Confirm skip"}
            </button>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              disabled={busy}
              onClick={() => {
                setOpen(null);
                setNotes("");
                setErrorMsg(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
