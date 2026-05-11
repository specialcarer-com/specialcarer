"use client";

import { useState } from "react";

export default function DisputeResolver({ payoutId }: { payoutId: string }) {
  const [busy, setBusy] = useState<"approve_change" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function resolve(resolution: "approve_change" | "reject") {
    setBusy(resolution);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll/disputes/${payoutId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "resolve failed");
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional admin notes for the carer (will be emailed)…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => resolve("approve_change")}
          disabled={busy !== null}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#0E7C7B" }}
        >
          {busy === "approve_change" ? "Approving…" : "Approve change → next run"}
        </button>
        <button
          type="button"
          onClick={() => resolve("reject")}
          disabled={busy !== null}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "reject" ? "Rejecting…" : "Reject → confirm as-is"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
