"use client";

import { useState } from "react";

export default function DisputeForm({
  payslipId,
  previewClosesAt,
}: {
  payslipId: string;
  previewClosesAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/carer/payslips/${payslipId}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          booking_id: bookingId.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "submission failed");
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border px-3 py-2 text-sm font-medium"
        style={{ borderColor: "#F4A261", color: "#F4A261" }}
      >
        Flag a dispute
      </button>
    );
  }

  return (
    <div className="w-full mt-2 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">Flag a dispute</div>
      <p className="mt-1 text-xs text-slate-500">
        Tell us what's wrong. We'll remove this payout from the run and
        investigate.
        {previewClosesAt && (
          <>
            {" "}Review window closes {new Date(previewClosesAt).toLocaleString("en-GB")}.
          </>
        )}
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe the issue — missing shift, wrong rate, wrong hours…"
        rows={3}
        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={bookingId}
        onChange={(e) => setBookingId(e.target.value)}
        placeholder="Booking ID (optional)"
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#F4A261" }}
        >
          {busy ? "Submitting…" : "Submit dispute"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
