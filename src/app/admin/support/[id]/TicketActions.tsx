"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/admin-ops/types";

type Props = {
  ticketId: string;
  initialStatus: TicketStatus;
  initialPriority: TicketPriority;
};

export default function TicketActions({
  ticketId,
  initialStatus,
  initialPriority,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<TicketStatus>(initialStatus);
  const [priority, setPriority] = useState<TicketPriority>(initialPriority);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Triage
      </p>
      <label className="block text-sm">
        <span className="block text-xs text-slate-500 mb-1">Status</span>
        <select
          value={status}
          onChange={(e) => {
            const v = e.target.value as TicketStatus;
            setStatus(v);
            void patch({ status: v });
          }}
          disabled={busy}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="block text-xs text-slate-500 mb-1">Priority</span>
        <select
          value={priority}
          onChange={(e) => {
            const v = e.target.value as TicketPriority;
            setPriority(v);
            void patch({ priority: v });
          }}
          disabled={busy}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {err && (
        <p aria-live="polite" className="text-xs text-rose-700">
          {err}
        </p>
      )}
    </div>
  );
}
