"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  async function call(action: "verify" | "reject") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/vetting/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reason: reason || undefined }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => call("verify")}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
      >
        Verify
      </button>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reject reason (optional)"
        className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 w-64"
      />
      <button
        type="button"
        onClick={() => call("reject")}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
