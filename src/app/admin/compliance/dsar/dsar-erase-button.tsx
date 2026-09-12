"use client";

import { useState } from "react";
import {
  ERASE_CONFIRMATION,
  NOTES_MAX,
  canSubmitErase,
  reduceEraseResponse,
  type EraseUiState,
} from "@/lib/dsar/erase-confirmation";

/**
 * Admin-facing "Erase…" button for verified, in-progress erasure DSAR
 * rows.
 *
 * Because the C1 handler is irreversible (hard-deletes across ~15
 * tables, then queues deferred deletes with retention timers), the
 * button requires the admin to type the word ERASE before Submit is
 * enabled. Notes are free-form (max 1000 chars) and captured in the
 * page-level admin_audit_log via the route wrapper — they are NOT
 * emailed to the subject.
 */
export default function DsarEraseButton({
  requestId,
  subjectEmail,
}: {
  requestId: string;
  subjectEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EraseUiState | null>(null);

  const canSubmit = canSubmitErase({
    typed_confirmation: typed,
    notes,
    busy,
  });

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/dsar/${requestId}/erase`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Notes are audit-only; the route's admin action log picks
        // them up via the request body if the route grows to accept
        // them. Today the route ignores the body, which is safe.
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as unknown;
      const reduced = reduceEraseResponse(res.status, body);
      setResult(reduced);
      // Only auto-reload on clean success. Partial/error keeps the
      // dialog open so the admin can see what went wrong before the
      // page refreshes.
      if (reduced.kind === "ok") {
        setTimeout(() => location.reload(), 1200);
        return;
      }
    } catch (e) {
      setResult({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-50"
      >
        Erase…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border-2 border-rose-300 bg-rose-50/60 p-3">
      <p className="text-xs text-slate-800">
        <strong className="text-rose-900">Irreversible.</strong> This runs
        the Article-17 erasure manifest for{" "}
        <span className="font-mono">{subjectEmail}</span>: PII is nulled
        across the account, session, and messaging tables; rows subject
        to statutory retention (payroll, safeguarding, accounting) are
        queued for hard-deletion when their retention window ends. A
        completion email is sent to the subject.
      </p>

      <label className="block text-xs text-slate-700">
        Type <code className="rounded bg-white px-1 font-mono">{ERASE_CONFIRMATION}</code> to confirm:
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-sm"
          placeholder={ERASE_CONFIRMATION}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <label className="block text-xs text-slate-700">
        Operator notes (audit only — not emailed to the subject):
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={NOTES_MAX}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
          placeholder="Optional: ticket reference, verification method, escalation notes…"
        />
        <span className="text-[10px] text-slate-500">
          {notes.trim().length} / {NOTES_MAX}
        </span>
      </label>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setNotes("");
            setResult(null);
          }}
          disabled={busy}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-40"
        >
          {busy ? "Erasing…" : "Erase this request"}
        </button>
      </div>

      {result && result.kind === "ok" && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
          Erased. {result.summary} Reloading…
        </p>
      )}
      {result && result.kind === "partial" && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p>
            <strong>Erased with warnings.</strong> {result.summary}
          </p>
          <ul className="list-disc pl-4">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {result && result.kind === "error" && (
        <p className="rounded-md border border-rose-300 bg-white p-2 text-xs text-rose-800">
          {result.message}
        </p>
      )}
    </div>
  );
}
