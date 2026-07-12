"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RerunCrossCheckButton({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setMsg(null);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/admin/dbs/${applicationId}/cross-check`, {
          method: "POST",
        });
      } catch {
        setMsg("Network error — please check your connection and try again.");
        return;
      }
      let body: { error?: string; result?: { ok?: boolean } } = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (!res.ok) {
        setMsg(body.error ?? "Failed to re-run cross-check");
        return;
      }
      setMsg(body.result?.ok ? "Cross-check passed" : "Cross-check mismatch");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        type="button"
        onClick={rerun}
        disabled={busy}
        className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        {busy ? "Running…" : "Re-run cross-check"}
      </button>
    </div>
  );
}
