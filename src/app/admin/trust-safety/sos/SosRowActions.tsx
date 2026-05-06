"use client";

/**
 * Inline ack/resolve buttons for the SOS admin queue.
 * Calls /api/admin/sos/[id]/status and refreshes the page on success.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  id: string;
  status: "open" | "acknowledged" | "resolved";
};

export default function SosRowActions({ id, status }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (next: "acknowledged" | "resolved") => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fetch(`/api/admin/sos/${id}/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(j.error ?? "Couldn't update");
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update");
      }
    });
  };

  if (status === "resolved") {
    return <span className="text-xs text-slate-400">Resolved</span>;
  }

  return (
    <div className="inline-flex items-center gap-2">
      {status === "open" && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => update("acknowledged")}
          className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {isPending ? "…" : "Acknowledge"}
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => update("resolved")}
        className="text-xs px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
      >
        {isPending ? "…" : "Resolve"}
      </button>
      {error && (
        <span className="text-[11px] text-rose-600 ml-2">{error}</span>
      )}
    </div>
  );
}
