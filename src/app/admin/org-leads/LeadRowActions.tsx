"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
  "new",
  "contacted",
  "qualified",
  "disqualified",
  "converted",
] as const;

export default function LeadRowActions({
  id,
  currentStatus,
  initialNotes,
}: {
  id: string;
  currentStatus: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/org-leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Update failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => patch({ status: s }, s)}
            disabled={busy != null || currentStatus === s}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              currentStatus === s
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            } disabled:opacity-50`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-start">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Internal notes…"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
        />
        <button
          type="button"
          onClick={() => patch({ notes }, "save_notes")}
          disabled={busy != null}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy === "save_notes" ? "Saving…" : "Save note"}
        </button>
      </div>
      {err && <p className="text-xs text-rose-700">{err}</p>}
    </div>
  );
}
