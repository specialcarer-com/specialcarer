"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PublishToggle({
  userId,
  isPublished,
  ready,
}: {
  userId: string;
  isPublished: boolean;
  ready: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const action = isPublished ? "unpublish" : "publish";

  async function submit() {
    setError(null);
    const overrideBlockers = !isPublished && !ready;
    const body: Record<string, unknown> = { action };
    if (overrideBlockers || reason) body.reason = reason || "(none)";
    try {
      const res = await fetch(`/api/admin/caregivers/${userId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setConfirming(false);
      setReason("");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  // Inline confirm UI for unpublish, or for publish-with-blockers
  const requiresConfirm = isPublished || !ready;

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            isPublished
              ? "Reason for unpublish (required)"
              : "Reason for override (required)"
          }
          className="text-xs border border-slate-300 rounded-md px-2 py-1 w-56"
        />
        <button
          onClick={submit}
          disabled={pending || !reason.trim()}
          className={`text-xs font-medium px-3 py-1 rounded-md text-white ${
            isPublished
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-amber-600 hover:bg-amber-700"
          } disabled:opacity-50`}
        >
          {pending ? "…" : isPublished ? "Confirm unpublish" : "Override & publish"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setReason("");
            setError(null);
          }}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          if (requiresConfirm) {
            setConfirming(true);
          } else {
            submit();
          }
        }}
        disabled={pending}
        className={`text-xs font-medium px-3 py-1 rounded-md disabled:opacity-50 ${
          isPublished
            ? "bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
            : ready
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
        }`}
      >
        {pending
          ? "…"
          : isPublished
            ? "Unpublish"
            : ready
              ? "Publish"
              : "Publish (override)"}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
