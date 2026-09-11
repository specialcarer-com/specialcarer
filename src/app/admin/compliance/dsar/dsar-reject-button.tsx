"use client";

import { useState } from "react";

const REASON_MIN = 10;
const REASON_MAX = 2000;

export default function DsarRejectButton({
  requestId,
  subjectEmail,
  requestType,
}: {
  requestId: string;
  subjectEmail: string;
  requestType: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dsar/${requestId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        email_sent?: boolean;
        email_error?: string;
      };
      if (!res.ok || j.ok !== true) {
        throw new Error(j.message ?? j.error ?? "Reject failed");
      }
      if (j.email_sent === false) {
        // Rejection persisted but email did not send — surface it so the
        // admin can email the subject manually.
        setError(
          `Rejected, but the email did not send: ${j.email_error ?? "unknown error"}`,
        );
        setBusy(false);
        return;
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
      >
        Reject…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50/40 p-3">
      <p className="text-xs text-slate-700">
        Rejecting <strong>{requestType}</strong> for{" "}
        <span className="font-mono">{subjectEmail}</span>. The reason below is
        emailed to the subject verbatim with ICO signposting. Do not include
        internal notes.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain why we cannot action this request (e.g. subject not identified, third-party rights, no personal data held)…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        rows={3}
        minLength={REASON_MIN}
        maxLength={REASON_MAX}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          {trimmed.length} / {REASON_MAX}
          {trimmed.length < REASON_MIN && (
            <> (min {REASON_MIN})</>
          )}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setReason("");
              setError(null);
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
            className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Rejecting…" : "Send rejection"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
