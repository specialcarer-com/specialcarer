"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ResetButton({
  vendor,
  eventId,
}: {
  vendor: string;
  eventId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/webhooks/${vendor}/${encodeURIComponent(eventId)}/reset`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
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
        className="text-xs font-medium px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
      >
        Reset for retry
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        className="text-xs border border-slate-300 rounded-md px-2 py-1 w-40"
      />
      <button
        onClick={submit}
        disabled={pending || !reason.trim()}
        className="text-xs font-medium px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "…" : "Reset"}
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setReason("");
          setError(null);
        }}
        className="text-xs text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
