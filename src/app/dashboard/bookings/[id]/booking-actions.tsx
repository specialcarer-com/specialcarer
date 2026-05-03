"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Action = "cancel" | "decline" | "start" | "complete";

export default function BookingActions({
  bookingId,
  status,
  role,
}: {
  bookingId: string;
  status: string;
  role: "seeker" | "caregiver";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<Action | null>(null);

  const canCancel = role === "seeker" && ["pending", "accepted", "paid"].includes(status);
  const canDecline = role === "caregiver" && ["pending", "accepted", "paid"].includes(status);
  const canStart = role === "caregiver" && ["paid", "accepted"].includes(status);
  const canComplete = ["paid", "in_progress"].includes(status);

  function run(action: Action) {
    setErr(null);
    startTransition(async () => {
      try {
        if (action === "complete") {
          const res = await fetch("/api/stripe/complete-shift", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ booking_id: bookingId }),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? "Failed to mark complete");
          }
        } else {
          const res = await fetch(`/api/bookings/${bookingId}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error ?? "Action failed");
          }
        }
        setConfirmAction(null);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  if (!canCancel && !canDecline && !canStart && !canComplete) return null;

  return (
    <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-100">
      <h2 className="font-semibold">Manage shift</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {canStart && (
          <button
            type="button"
            onClick={() => run("start")}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
          >
            I&rsquo;ve arrived — start shift
          </button>
        )}
        {canComplete && (
          <button
            type="button"
            onClick={() => run("complete")}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
          >
            Mark shift complete
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => setConfirmAction("cancel")}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50"
          >
            Cancel booking
          </button>
        )}
        {canDecline && (
          <button
            type="button"
            onClick={() => setConfirmAction("decline")}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-white border border-rose-200 text-rose-700 text-sm font-medium hover:bg-rose-50 transition disabled:opacity-50"
          >
            Decline booking
          </button>
        )}
      </div>

      {confirmAction && (
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <p>
            {confirmAction === "cancel"
              ? "Cancel this booking? If a card was authorized, the hold will be released immediately."
              : "Decline this booking? If a card was authorized, the family will be refunded immediately."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => run(confirmAction)}
              disabled={pending}
              className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-50"
            >
              {pending ? "Working…" : `Yes, ${confirmAction}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              disabled={pending}
              className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              Keep booking
            </button>
          </div>
        </div>
      )}

      {err && (
        <p className="mt-3 text-sm text-rose-600">{err}</p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Funds release to the caregiver 24 hours after the shift is marked complete.
      </p>
    </div>
  );
}
