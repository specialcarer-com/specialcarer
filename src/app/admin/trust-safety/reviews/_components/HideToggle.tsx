"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function HideToggle({
  reviewId,
  hidden,
}: {
  reviewId: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const action = hidden ? "unhide" : "hide";
  const label = hidden ? "Unhide" : "Hide";
  const cls = hidden
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : "bg-rose-600 text-white hover:bg-rose-700";

  async function submit() {
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}/hide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setOpen(false);
      setReason("");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`text-xs font-medium px-2.5 py-1 rounded-md ${cls}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="space-y-2 min-w-[280px]">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Reason for ${action} (required)`}
        rows={2}
        className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending || !reason.trim()}
          className={`text-xs font-medium px-3 py-1 rounded-md ${cls} disabled:opacity-50`}
        >
          {pending ? "Working…" : `Confirm ${label.toLowerCase()}`}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="text-xs text-slate-600 hover:text-slate-900"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-rose-700">{error}</span>}
      </div>
    </div>
  );
}
