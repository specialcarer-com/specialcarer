"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { backgroundCheckId: string };

export default function ReverifyRowActions({ backgroundCheckId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "request" | "mark_cleared" | "snooze") {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch("/api/admin/reverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          background_check_id: backgroundCheckId,
          action,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => act("request")}
        disabled={busy !== null}
        className="text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white disabled:opacity-60"
      >
        {busy === "request" ? "…" : "Request"}
      </button>
      <button
        onClick={() => act("mark_cleared")}
        disabled={busy !== null}
        className="text-xs px-2.5 py-1 rounded-md bg-emerald-600 text-white disabled:opacity-60"
      >
        {busy === "mark_cleared" ? "…" : "Mark cleared"}
      </button>
      <button
        onClick={() => act("snooze")}
        disabled={busy !== null}
        className="text-xs px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 disabled:opacity-60"
      >
        {busy === "snooze" ? "…" : "Snooze 14d"}
      </button>
      {err && (
        <span aria-live="polite" className="text-xs text-rose-700 w-full">
          {err}
        </span>
      )}
    </div>
  );
}
