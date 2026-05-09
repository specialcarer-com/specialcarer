"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "new" | "reviewing" | "cleared" | "confirmed";

type Props = {
  signalId: string;
  current: Status;
};

export default function FraudActions({ signalId, current }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function setStatus(next: Status) {
    if (next === current) return;
    setBusy(next);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/finance/fraud/${signalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const buttons: { v: Status; label: string; cls: string }[] = [
    {
      v: "reviewing",
      label: "Reviewing",
      cls: "bg-sky-600 text-white",
    },
    {
      v: "cleared",
      label: "Clear",
      cls: "bg-emerald-600 text-white",
    },
    {
      v: "confirmed",
      label: "Confirm",
      cls: "bg-rose-600 text-white",
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {buttons.map((b) => (
        <button
          key={b.v}
          onClick={() => setStatus(b.v)}
          disabled={busy !== null || current === b.v}
          className={`text-[11px] px-2 py-1 rounded-md font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${b.cls}`}
        >
          {busy === b.v ? "…" : b.label}
        </button>
      ))}
      {err && (
        <span aria-live="polite" className="text-[11px] text-rose-700 w-full">
          {err}
        </span>
      )}
    </div>
  );
}
