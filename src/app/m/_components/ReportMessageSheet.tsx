"use client";

/**
 * P1-B10: tiny dialog for reporting a chat message.
 *
 * Renders the reason picker + free-text notes + Cancel / Report
 * buttons. Submits to POST /api/m/chat/messages/[messageId]/report;
 * shows optimistic feedback once the request lands. Plus Jakarta Sans
 * + brand teal; styling matches the rest of /m/ surfaces.
 */
import { useState } from "react";

const JAKARTA =
  "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif";

type Reason = "harassment" | "spam" | "safeguarding" | "other";

const REASON_OPTIONS: { value: Reason; label: string; blurb: string }[] = [
  {
    value: "harassment",
    label: "Harassment",
    blurb: "Threatening, abusive, or hateful language.",
  },
  {
    value: "spam",
    label: "Spam or scam",
    blurb: "Unwanted promotions, scams, or phishing.",
  },
  {
    value: "safeguarding",
    label: "Safeguarding concern",
    blurb: "A vulnerable adult or child may be at risk.",
  },
  { value: "other", label: "Other", blurb: "Anything else that feels wrong." },
];

export function ReportMessageSheet({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/m/chat/messages/${encodeURIComponent(messageId)}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn’t report. Try again.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report message"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl"
        style={{ fontFamily: JAKARTA, color: "#0F1416" }}
      >
        {done ? (
          <div className="py-6 text-center">
            <p className="text-[15px] font-semibold">Reported.</p>
            <p className="mt-2 text-[13px] text-[#52606D]">
              Our team will review.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-md px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: "#039EA0" }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[16px] font-bold">Report message</h2>
            <p className="mt-1 text-[12.5px] text-[#52606D]">
              Tell us what’s wrong. Reports are sent to SpecialCarer’s
              moderation team — only admins can see them.
            </p>

            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Reason</legend>
              {REASON_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-2 rounded-md border px-3 py-2"
                  style={{
                    borderColor: reason === opt.value ? "#039EA0" : "#E5E0D5",
                    background:
                      reason === opt.value ? "#E6F4F4" : "white",
                  }}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={opt.value}
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-[13.5px] font-semibold">{opt.label}</p>
                    <p className="text-[12px] text-[#52606D]">{opt.blurb}</p>
                  </div>
                </label>
              ))}
            </fieldset>

            <label className="mt-4 block">
              <span className="text-[12px] text-[#52606D]">
                Optional notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                className="mt-1 w-full resize-none rounded-md border px-3 py-2 text-[13.5px] focus:outline-none focus:border-primary"
                style={{ borderColor: "#E5E0D5", color: "#0F1416" }}
                placeholder="Add any context that would help."
              />
            </label>

            {err && (
              <p
                role="status"
                className="mt-3 rounded-md px-3 py-1.5 text-[12.5px]"
                style={{
                  background: "#FBEBEB",
                  border: "1px solid #F3CCCC",
                  color: "#C22",
                }}
              >
                {err}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
                style={{ borderColor: "#E5E0D5", color: "#0F1416" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!reason || busy}
                aria-disabled={!reason || busy}
                className="rounded-md px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "#039EA0" }}
              >
                {busy ? "Reporting…" : "Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
