"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { bookingId: string };

export default function RefundButton({ bookingId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function refund() {
    if (
      !confirm(
        "Mark this booking as refunded? This stub stamps refunded_at but does not move money — Stripe refund is handled separately.",
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "support_console" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="text-xs font-semibold text-emerald-700">
        Refund stub recorded ✓
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={refund}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold disabled:opacity-60"
      >
        {busy ? "Refunding…" : "Refund booking"}
      </button>
      {err && (
        <p aria-live="polite" className="mt-1 text-xs text-rose-700">
          {err}
        </p>
      )}
    </div>
  );
}
