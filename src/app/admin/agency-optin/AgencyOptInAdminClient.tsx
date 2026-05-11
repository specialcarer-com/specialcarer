"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GatesRow } from "@/lib/agency-optin/server";

const BRAND = "#0E7C7B";
const ACCENT = "#F4A261";

type Row = GatesRow & {
  full_name: string | null;
  country: string | null;
};

type Props = {
  tab: string;
  rows: Row[];
};

export default function AgencyOptInAdminClient({ tab, rows }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{
    userId: string;
    action: "reject" | "pause";
  } | null>(null);
  const [reasonText, setReasonText] = useState("");

  async function callAdmin(
    userId: string,
    action: "approve" | "reject" | "pause" | "resume",
    body?: Record<string, string>,
  ) {
    setErr(null);
    setBusy(`${userId}:${action}`);
    try {
      const res = await fetch(`/api/admin/agency-optin/${userId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "Failed");
      } else {
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  }

  function openReason(userId: string, action: "reject" | "pause") {
    setReasonText("");
    setReasonDialog({ userId, action });
  }
  async function submitReason() {
    if (!reasonDialog) return;
    if (reasonText.trim().length < 5) {
      setErr("Reason must be at least 5 characters");
      return;
    }
    await callAdmin(reasonDialog.userId, reasonDialog.action, { reason: reasonText.trim() });
    setReasonDialog(null);
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
        No carers in this state.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && (
        <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">
          {err}
        </div>
      )}
      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Carer</th>
              <th className="text-left px-4 py-3 font-semibold">Gates</th>
              <th className="text-left px-4 py-3 font-semibold">Submitted</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">
                    {r.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.country ?? "—"} · {r.user_id.slice(0, 8)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <GatePill label="Contract" ok={!!r.contract_ok} />
                    <GatePill label="DBS" ok={!!r.dbs_ok} />
                    <GatePill label="RTW" ok={!!r.rtw_ok} />
                    <GatePill
                      label={`Training ${r.training_passed_count ?? 0}/${r.training_required_count ?? 0}`}
                      ok={!!r.training_ok}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {r.agency_opt_in_submitted_at
                    ? new Date(r.agency_opt_in_submitted_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    {tab === "ready_for_review" && (
                      <>
                        <button
                          type="button"
                          onClick={() => callAdmin(r.user_id, "approve")}
                          disabled={busy !== null || !r.overall_ready}
                          className="px-3 py-1.5 text-xs font-bold text-white rounded-full disabled:opacity-50"
                          style={{ background: BRAND }}
                        >
                          {busy === `${r.user_id}:approve` ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openReason(r.user_id, "reject")}
                          disabled={busy !== null}
                          className="px-3 py-1.5 text-xs font-bold text-rose-700 border border-rose-300 rounded-full disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {tab === "active" && (
                      <button
                        type="button"
                        onClick={() => openReason(r.user_id, "pause")}
                        disabled={busy !== null}
                        className="px-3 py-1.5 text-xs font-bold rounded-full border disabled:opacity-50"
                        style={{ borderColor: ACCENT, color: ACCENT }}
                      >
                        Pause
                      </button>
                    )}
                    {tab === "paused" && (
                      <button
                        type="button"
                        onClick={() => callAdmin(r.user_id, "resume")}
                        disabled={busy !== null}
                        className="px-3 py-1.5 text-xs font-bold text-white rounded-full disabled:opacity-50"
                        style={{ background: BRAND }}
                      >
                        {busy === `${r.user_id}:resume` ? "…" : "Resume"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reasonDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900">
              {reasonDialog.action === "reject"
                ? "Reject application"
                : "Pause carer"}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              The carer will be emailed with this reason.
            </p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={4}
              className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="At least 5 characters…"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setReasonDialog(null)}
                className="px-4 py-2 rounded-full text-sm font-semibold text-slate-700 border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReason}
                disabled={busy !== null}
                className="px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: reasonDialog.action === "reject" ? "#BE123C" : ACCENT }}
              >
                {busy ? "…" : reasonDialog.action === "reject" ? "Reject" : "Pause"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GatePill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: ok ? "#D1FAE5" : "#FEE2E2",
        color: ok ? "#065F46" : "#9F1239",
      }}
    >
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}
