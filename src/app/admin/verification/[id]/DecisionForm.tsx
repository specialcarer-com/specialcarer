"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideSubmissionAction } from "../actions";

export default function DecisionForm({
  id,
  checklist,
  allowsExpiry,
}: {
  id: string;
  checklist: { key: string; label: string }[];
  allowsExpiry: boolean;
}) {
  const router = useRouter();
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      const r = await decideSubmissionAction({
        id,
        decision,
        checklist: ticks,
        note,
        expiresOn: expiresOn || null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/admin/verification");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Checklist (all items needed to approve)</h2>
      <ul className="space-y-2">
        {checklist.map((c) => (
          <li key={c.key}>
            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={ticks[c.key] === true}
                onChange={(e) => setTicks({ ...ticks, [c.key]: e.target.checked })}
              />
              <span>{c.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {allowsExpiry && (
        <label className="block text-sm text-slate-800">
          Permission to work ends on (leave blank if no end date)
          <input
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      <label className="block text-sm text-slate-800">
        Note (required if rejecting; the carer will see it)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("approved")}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("rejected")}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
