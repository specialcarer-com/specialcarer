"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND = "#0E7C7B";

type Row = {
  id: string;
  carer_id: string;
  carer_name: string;
  avatar_url: string | null;
  detected_at: string;
  source: string;
  prior_status: string | null;
  new_status: string | null;
  raw_payload: unknown;
};

type Decision = "cleared" | "suspended" | "requires_fresh_dbs";

export default function DbsChangeQueueClient({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(id: string, decision: Decision) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch("/api/admin/dbs-update-service/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: id, decision, notes: notes[id] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed");
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        Queue is empty. ✓
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
          {err}
        </div>
      )}
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex items-start gap-3">
            {row.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.avatar_url}
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-slate-200" />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{row.carer_name}</div>
                  <div className="text-xs text-slate-500">
                    Detected {new Date(row.detected_at).toLocaleString()} ·{" "}
                    {row.source}
                  </div>
                </div>
                <div className="text-xs text-slate-700">
                  {row.prior_status ?? "—"} → <strong>{row.new_status ?? "—"}</strong>
                </div>
              </div>
              <button
                type="button"
                className="text-xs text-slate-500 underline mt-2"
                onClick={() => setOpenId(openId === row.id ? null : row.id)}
              >
                {openId === row.id ? "Hide" : "Show"} raw payload
              </button>
              {openId === row.id && (
                <pre className="mt-2 p-2 rounded bg-slate-50 text-xs overflow-x-auto">
                  {JSON.stringify(row.raw_payload, null, 2)}
                </pre>
              )}
              <textarea
                value={notes[row.id] ?? ""}
                onChange={(e) =>
                  setNotes((n) => ({ ...n, [row.id]: e.target.value }))
                }
                placeholder="Notes (visible to other admins)"
                className="w-full mt-3 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                rows={2}
              />
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => decide(row.id, "cleared")}
                  disabled={busyId === row.id}
                  className="px-3 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: BRAND }}
                >
                  Cleared
                </button>
                <button
                  type="button"
                  onClick={() => decide(row.id, "suspended")}
                  disabled={busyId === row.id}
                  className="px-3 py-2 rounded-full text-sm font-semibold text-white bg-rose-600 disabled:opacity-50"
                >
                  Suspend
                </button>
                <button
                  type="button"
                  onClick={() => decide(row.id, "requires_fresh_dbs")}
                  disabled={busyId === row.id}
                  className="px-3 py-2 rounded-full text-sm font-semibold text-white bg-amber-600 disabled:opacity-50"
                >
                  Require fresh DBS
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
