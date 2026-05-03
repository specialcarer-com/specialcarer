"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Action = "force_release" | "refund" | "mark_disputed";

const META: Record<
  Action,
  { label: string; cls: string; help: string }
> = {
  force_release: {
    label: "Force release payout",
    cls: "bg-emerald-600 text-white hover:bg-emerald-700",
    help: "Captures the PaymentIntent now, skipping the 24h hold. Caregiver receives funds.",
  },
  refund: {
    label: "Refund booking",
    cls: "bg-rose-600 text-white hover:bg-rose-700",
    help: "Refunds captured funds, or cancels the PI auth if uncaptured. Status → refunded.",
  },
  mark_disputed: {
    label: "Mark as disputed",
    cls: "bg-amber-600 text-white hover:bg-amber-700",
    help: "Flags for manual review. No Stripe action taken.",
  },
};

export default function BookingActions({
  bookingId,
  canForceRelease,
  canRefund,
  canDispute,
}: {
  bookingId: string;
  canForceRelease: boolean;
  canRefund: boolean;
  canDispute: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!active) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: active, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setActive(null);
      setReason("");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (active) {
    const meta = META[active];
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            Confirm: {meta.label}
          </h3>
          <p className="text-xs text-amber-800 mt-1">{meta.help}</p>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — recorded in audit log"
          rows={2}
          className="w-full text-sm border border-amber-300 rounded-md px-2 py-1.5 bg-white"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={pending || !reason.trim()}
            className={`text-sm font-medium px-4 py-1.5 rounded-md ${meta.cls} disabled:opacity-50`}
          >
            {pending ? "Working…" : `Confirm ${meta.label.toLowerCase()}`}
          </button>
          <button
            onClick={() => {
              setActive(null);
              setReason("");
              setError(null);
            }}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-rose-700">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canForceRelease && (
        <button
          onClick={() => setActive("force_release")}
          className={`text-sm font-medium px-3 py-1.5 rounded-md ${META.force_release.cls}`}
        >
          {META.force_release.label}
        </button>
      )}
      {canRefund && (
        <button
          onClick={() => setActive("refund")}
          className={`text-sm font-medium px-3 py-1.5 rounded-md ${META.refund.cls}`}
        >
          {META.refund.label}
        </button>
      )}
      {canDispute && (
        <button
          onClick={() => setActive("mark_disputed")}
          className={`text-sm font-medium px-3 py-1.5 rounded-md ${META.mark_disputed.cls}`}
        >
          {META.mark_disputed.label}
        </button>
      )}
      {!canForceRelease && !canRefund && !canDispute && (
        <span className="text-xs text-slate-500">
          No admin actions available in this state.
        </span>
      )}
    </div>
  );
}
