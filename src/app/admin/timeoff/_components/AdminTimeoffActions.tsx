"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminTimeoffActions({
  requestId,
}: {
  requestId: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(status: "approved" | "declined") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/timeoff/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_note: note || undefined }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Optional note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="block w-40 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none"
      />
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={() => act("approved")}
          disabled={loading}
          className="rounded px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "…" : "Approve"}
        </button>
        <button
          onClick={() => act("declined")}
          disabled={loading}
          className="rounded px-2.5 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "…" : "Decline"}
        </button>
      </div>
    </div>
  );
}
