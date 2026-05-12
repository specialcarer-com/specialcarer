"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

export default function RequestLeaveButton({
  availableCents,
  disabled,
}: {
  availableCents: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<string>("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const h = Number(hours);
      if (!Number.isFinite(h) || h <= 0) {
        setError("Enter a positive number of hours.");
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/carer/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_hours: h,
          reason: reason || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Request failed.");
        setSubmitting(false);
        return;
      }
      setOpen(false);
      setHours("");
      setReason("");
      setStartDate("");
      setEndDate("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "#0E7C7B" }}
      >
        Request paid leave
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Request paid leave
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Available to request: <strong>{gbp(availableCents)}</strong>. Your
              manager will review.
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Hours
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C7B]"
                disabled={submitting}
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                Start date (optional)
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C7B]"
                  disabled={submitting}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                End date (optional)
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C7B]"
                  disabled={submitting}
                />
              </label>
            </div>

            <label className="mt-3 block text-sm font-medium text-slate-700">
              Reason (optional)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7C7B]"
                disabled={submitting}
              />
            </label>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#0E7C7B" }}
              >
                {submitting ? "Sending…" : "Submit request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
