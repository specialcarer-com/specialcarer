"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LEAVE_REQUEST_STATUSES,
  type LeaveRequestStatus,
} from "@/lib/safety/types";

type Props = {
  requestId: string;
  initialStatus: LeaveRequestStatus;
  initialNotes: string;
};

export default function LeaveRequestRowActions({
  requestId,
  initialStatus,
  initialNotes,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LeaveRequestStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/safety/leave-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, adminNotes: notes }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Could not save.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-slate-900 hover:underline"
      >
        Edit →
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as LeaveRequestStatus)}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
      >
        {LEAVE_REQUEST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={2000}
        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
        placeholder="Internal notes"
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
          onClick={save}
          disabled={busy}
          className="px-2 py-1 rounded-md bg-slate-900 text-white"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
