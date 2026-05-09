"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { payoutId: string; disabled?: boolean };

export default function ReleaseButton({ payoutId, disabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function release() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/finance/payouts/${payoutId}/release`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={release}
        disabled={busy || disabled}
        className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "Releasing…" : "Release"}
      </button>
      {err && (
        <p aria-live="polite" className="mt-1 text-[11px] text-rose-700">
          {err}
        </p>
      )}
    </div>
  );
}
