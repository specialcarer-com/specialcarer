"use client";

import { useState } from "react";

export default function TriggerButtons({
  runId,
  status,
}: {
  runId: string;
  status: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(action: "preview" | "run") {
    const label = action === "preview" ? "open preview" : "execute the payroll run";
    if (!confirm(`Are you sure you want to ${label}? This will send emails to carers.`)) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payroll/runs/${runId}/trigger`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "trigger failed");
      }
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => trigger("preview")}
          disabled={busy !== null || status === "completed"}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#0E7C7B" }}
        >
          {busy === "preview" ? "Opening…" : "Open preview"}
        </button>
        <button
          type="button"
          onClick={() => trigger("run")}
          disabled={busy !== null || status === "completed" || status === "running"}
          className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "#F4A261" }}
        >
          {busy === "run" ? "Running…" : "Execute run"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
