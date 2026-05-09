import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FRAUD_SIGNAL_STATUSES,
  type FraudSignalStatus,
} from "@/lib/admin-ops/types";
import FinanceTabs from "../_tabs";
import FraudActions from "./FraudActions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  subject_type: "user" | "booking" | "caregiver";
  subject_id: string;
  signal_type: string;
  severity: number;
  details: Record<string, unknown>;
  status: FraudSignalStatus;
  flagged_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

const STATUS_TONE: Record<FraudSignalStatus, string> = {
  new: "bg-amber-50 text-amber-800 border-amber-200",
  reviewing: "bg-sky-50 text-sky-800 border-sky-200",
  cleared: "bg-emerald-50 text-emerald-800 border-emerald-200",
  confirmed: "bg-rose-50 text-rose-800 border-rose-200",
};

function subjectHref(type: Row["subject_type"], id: string): string {
  if (type === "booking") return `/admin/bookings/${id}`;
  if (type === "caregiver") return `/admin/caregivers/${id}`;
  return `/admin/users/${id}`;
}

function severityDots(severity: number) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`severity ${severity}`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= severity;
        const tone =
          severity >= 4
            ? "bg-rose-500"
            : severity === 3
              ? "bg-amber-500"
              : "bg-slate-400";
        return (
          <span
            key={i}
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              filled ? tone : "bg-slate-200"
            }`}
          />
        );
      })}
    </span>
  );
}

export default async function FraudPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "new";
  const minSeverity = sp.severity ?? "1";

  const admin = createAdminClient();
  let q = admin
    .from("fraud_signals")
    .select(
      "id, subject_type, subject_id, signal_type, severity, details, status, flagged_at, reviewed_by, reviewed_at",
    )
    .order("flagged_at", { ascending: false })
    .limit(500);
  if (
    status !== "all" &&
    (FRAUD_SIGNAL_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }
  const sevN = Number(minSeverity);
  if (Number.isInteger(sevN) && sevN >= 1 && sevN <= 5) {
    q = q.gte("severity", sevN);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <FinanceTabs active="/admin/finance/fraud" />

      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Fraud signals</h1>
        <p className="text-sm text-slate-500 mt-1">
          Automated and manual flags across users, bookings, and caregivers.
          Triage by status; severity 4–5 are red.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(["new", "reviewing", "cleared", "confirmed", "all"] as const).map(
            (s) => (
              <Link
                key={s}
                href={`/admin/finance/fraud?status=${s}&severity=${minSeverity}`}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  status === s
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200"
                }`}
              >
                {s}
              </Link>
            ),
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wide text-slate-500">
            Min severity
          </span>
          {[1, 2, 3, 4, 5].map((n) => (
            <Link
              key={n}
              href={`/admin/finance/fraud?status=${status}&severity=${n}`}
              className={`px-2 py-1 rounded-md border text-[11px] font-semibold ${
                String(n) === minSeverity
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
            >
              {n}+
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No fraud signals in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">Subject</th>
                <th className="text-left px-4 py-2.5">Signal</th>
                <th className="text-left px-4 py-2.5">Severity</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Flagged</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      {r.subject_type}
                    </p>
                    <Link
                      href={subjectHref(r.subject_type, r.subject_id)}
                      className="font-mono text-xs text-teal-700 hover:underline"
                    >
                      {r.subject_id.slice(0, 12)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {r.signal_type.replace(/_/g, " ")}
                    </p>
                    {r.details && Object.keys(r.details).length > 0 && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 max-w-xs font-mono">
                        {JSON.stringify(r.details)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {severityDots(r.severity)}{" "}
                    <span className="text-[11px] text-slate-500 ml-1">
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(r.flagged_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    <FraudActions signalId={r.id} current={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
