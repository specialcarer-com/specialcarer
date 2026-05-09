"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SAFETY_REPORT_STATUSES,
  type SafetyReportStatus,
} from "@/lib/safety/types";

type Props = {
  reportId: string;
  initialStatus: SafetyReportStatus;
  initialNotes: string;
};

export default function SafetyReportActions({
  reportId,
  initialStatus,
  initialNotes,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<SafetyReportStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/safety/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNotes: notes }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Could not save.");
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Status
        </span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SafetyReportStatus)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {SAFETY_REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Admin notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={5000}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      {err && (
        <p aria-live="polite" className="text-sm text-rose-700">
          {err}
        </p>
      )}
      {savedAt && (
        <p className="text-sm text-emerald-700">
          Saved {new Date(savedAt).toLocaleTimeString()}
        </p>
      )}
      <button
        onClick={save}
        disabled={busy}
        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
