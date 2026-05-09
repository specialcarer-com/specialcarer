"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrgRowActions({
  orgId,
  currentStatus,
}: {
  orgId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [info, setInfo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: "approve" | "reject" | "request-info") {
    setBusy(action);
    setErr(null);
    setMsg(null);
    try {
      const body =
        action === "reject"
          ? { reason }
          : action === "request-info"
            ? { message: info }
            : {};
      const res = await fetch(`/api/admin/orgs/${orgId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Action failed.");
        return;
      }
      setMsg("Done.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Actions
      </p>

      <div>
        <button
          type="button"
          onClick={() => call("approve")}
          disabled={busy != null || currentStatus === "verified"}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          {currentStatus === "verified" ? "Already verified" : "Approve"}
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1">Reject</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="What needs fixing? Sent to the booker."
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
        />
        <button
          type="button"
          onClick={() => call("reject")}
          disabled={busy != null || !reason.trim()}
          className="mt-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50"
        >
          Reject &amp; email
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1">
          Request more info
        </p>
        <textarea
          value={info}
          onChange={(e) => setInfo(e.target.value)}
          rows={3}
          placeholder="What do you need? Status stays pending."
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
        />
        <button
          type="button"
          onClick={() => call("request-info")}
          disabled={busy != null || !info.trim()}
          className="mt-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
        >
          Send request
        </button>
      </div>

      {err && <p className="text-sm text-rose-700">{err}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
