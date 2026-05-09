"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { ticketId: string };

export default function TicketReply({ ticketId }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/support/tickets/${ticketId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim(), internal_note: internal }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr((j as { error?: string }).error ?? "Failed");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        maxLength={10000}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder={
          internal
            ? "Internal note (only visible to admins)…"
            : "Reply to the user…"
        }
      />
      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
          />
          Internal note
        </label>
        {err && (
          <span aria-live="polite" className="text-xs text-rose-700">
            {err}
          </span>
        )}
        <button
          onClick={submit}
          disabled={busy || body.trim().length === 0}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Sending…" : internal ? "Add note" : "Reply"}
        </button>
      </div>
    </div>
  );
}
