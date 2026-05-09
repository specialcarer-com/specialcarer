"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action =
  | "soft_delete_thread"
  | "soft_delete_post"
  | "lock_thread"
  | "none";

type Props = {
  reportId: string;
  hasThread: boolean;
  hasPost: boolean;
};

export default function ForumReportRowActions({
  reportId,
  hasThread,
  hasPost,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(status: "actioned" | "dismissed", action: Action) {
    setBusy(`${status}:${action}`);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/community/reports/${reportId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, action }),
        },
      );
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
    <div className="flex flex-wrap gap-2 mt-2">
      {hasThread && (
        <>
          <button
            onClick={() => act("actioned", "soft_delete_thread")}
            disabled={busy !== null}
            className="text-xs px-3 py-1 rounded-md bg-rose-600 text-white"
          >
            {busy === "actioned:soft_delete_thread"
              ? "…"
              : "Delete thread"}
          </button>
          <button
            onClick={() => act("actioned", "lock_thread")}
            disabled={busy !== null}
            className="text-xs px-3 py-1 rounded-md bg-amber-600 text-white"
          >
            {busy === "actioned:lock_thread" ? "…" : "Lock thread"}
          </button>
        </>
      )}
      {hasPost && (
        <button
          onClick={() => act("actioned", "soft_delete_post")}
          disabled={busy !== null}
          className="text-xs px-3 py-1 rounded-md bg-rose-600 text-white"
        >
          {busy === "actioned:soft_delete_post" ? "…" : "Delete post"}
        </button>
      )}
      <button
        onClick={() => act("dismissed", "none")}
        disabled={busy !== null}
        className="text-xs px-3 py-1 rounded-md border border-slate-300 text-slate-700"
      >
        {busy === "dismissed:none" ? "…" : "Dismiss"}
      </button>
      {err && (
        <p aria-live="polite" className="text-xs text-rose-700 w-full">
          {err}
        </p>
      )}
    </div>
  );
}
