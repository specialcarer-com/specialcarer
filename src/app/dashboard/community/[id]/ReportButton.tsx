"use client";

import { useState } from "react";
import {
  FORUM_REPORT_REASONS,
  FORUM_REPORT_REASON_LABEL,
  type ForumReportReason,
} from "@/lib/community/types";

type Props = {
  threadId?: string;
  postId?: string;
};

export default function ReportButton({ threadId, postId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ForumReportReason>("spam");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/community/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, postId, reason, description }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { message?: string }).message ?? "Could not report.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="text-xs text-emerald-700 font-semibold">Reported ✓</span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-rose-700"
      >
        Report
      </button>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 mt-2 space-y-2 text-xs">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as ForumReportReason)}
        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
      >
        {FORUM_REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {FORUM_REPORT_REASON_LABEL[r]}
          </option>
        ))}
      </select>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Optional details"
        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
      />
      {err && <p aria-live="polite" className="text-rose-700">{err}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setOpen(false)}
          className="px-2 py-1 rounded-md border border-slate-200"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="px-2 py-1 rounded-md bg-rose-600 text-white"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
