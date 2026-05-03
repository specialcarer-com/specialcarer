"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Decision = "approved" | "rejected" | "requested_more_info";

const META: Record<Decision, { label: string; cls: string }> = {
  approved: {
    label: "Approve",
    cls: "bg-emerald-600 text-white hover:bg-emerald-700",
  },
  rejected: {
    label: "Reject",
    cls: "bg-rose-600 text-white hover:bg-rose-700",
  },
  requested_more_info: {
    label: "Request more info",
    cls: "bg-amber-600 text-white hover:bg-amber-700",
  },
};

export default function KycDecide({
  backgroundCheckId,
  alreadyDecided,
}: {
  backgroundCheckId: string;
  alreadyDecided: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<Decision | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!active) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/kyc/${backgroundCheckId}/decide`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: active, notes }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      setActive(null);
      setNotes("");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (active) {
    const meta = META[active];
    return (
      <div className="rounded-xl border border-slate-300 bg-white p-3 space-y-2 min-w-[300px]">
        <div className="text-xs font-semibold text-slate-700">
          {meta.label}: notes (required, recorded in audit log)
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5"
          placeholder="Reasoning, evidence reviewed, follow-up needed…"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={submit}
            disabled={pending || !notes.trim()}
            className={`text-xs font-medium px-3 py-1 rounded-md ${meta.cls} disabled:opacity-50`}
          >
            {pending ? "Working…" : `Confirm ${meta.label.toLowerCase()}`}
          </button>
          <button
            onClick={() => {
              setActive(null);
              setNotes("");
              setError(null);
            }}
            className="text-xs text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          {error && <span className="text-xs text-rose-700">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(META) as Decision[]).map((d) => (
        <button
          key={d}
          onClick={() => setActive(d)}
          className={`text-xs font-medium px-2.5 py-1 rounded-md ${META[d].cls}`}
        >
          {META[d].label}
        </button>
      ))}
      {alreadyDecided && (
        <span className="text-[11px] text-slate-500">
          (will overwrite prior decision)
        </span>
      )}
    </div>
  );
}
