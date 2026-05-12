"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  full_name: string | null;
  country: string | null;
  works_with_adults: boolean;
  works_with_children: boolean;
  works_with_children_admin_approved_at: string | null;
  agency_opt_in_status: string;
};

const BRAND = "#0E7C7B";

export default function ChildOptInQueueClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(path: string) {
    setErr(null);
    setBusy(path);
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "Request failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
        No pending child-population opt-ins.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {err}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Carer</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Opt-in status</th>
              <th className="px-4 py-3">Adults?</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const approvePath = `/api/admin/agency-optin/child-opt-ins/${r.id}/approve`;
              const rejectPath = `/api/admin/agency-optin/child-opt-ins/${r.id}/reject`;
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {r.full_name ?? r.id}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.country ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.agency_opt_in_status}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.works_with_adults ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => act(approvePath)}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: BRAND }}
                      >
                        {busy === approvePath ? "…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => act(rejectPath)}
                        className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                      >
                        {busy === rejectPath ? "…" : "Reject"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
