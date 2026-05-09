import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SAFETY_REPORT_TYPE_LABEL,
  SAFETY_SEVERITY_LABEL,
  SAFETY_REPORT_STATUSES,
  type SafetyReport,
} from "@/lib/safety/types";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  triaging: "bg-amber-50 text-amber-800 border-amber-200",
  escalated: "bg-rose-50 text-rose-800 border-rose-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  dismissed: "bg-slate-100 text-slate-700 border-slate-200",
};

export default async function AdminSafetyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "open";

  const admin = createAdminClient();
  let q = admin
    .from("safety_reports")
    .select(
      "id, reporter_user_id, booking_id, subject_user_id, report_type, severity, description, evidence_urls, status, admin_notes, resolved_by, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (
    status !== "all" &&
    (SAFETY_REPORT_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }
  const { data } = await q;
  const list = (data ?? []) as SafetyReport[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Safety reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Carer-raised reports about clients or shift environments. Immediate-
          danger reports auto-trigger an SOS alert.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["open", "triaging", "escalated", "resolved", "dismissed", "all"] as const).map(
          (s) => (
            <Link
              key={s}
              href={`/admin/trust-safety/safety-reports?status=${s}`}
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

      {list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No reports in this filter.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl bg-white border border-slate-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {SAFETY_REPORT_TYPE_LABEL[r.report_type]} ·{" "}
                    {SAFETY_SEVERITY_LABEL[r.severity]}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.created_at).toLocaleString("en-GB")} ·{" "}
                    Reporter {r.reporter_user_id.slice(0, 8)}
                    {r.booking_id && ` · Booking ${r.booking_id.slice(0, 8)}`}
                  </p>
                  <p className="text-sm text-slate-700 mt-2 line-clamp-3 whitespace-pre-wrap">
                    {r.description}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${TONE[r.status] ?? TONE.open}`}
                  >
                    {r.status}
                  </span>
                  <Link
                    href={`/admin/trust-safety/safety-reports/${r.id}`}
                    className="text-xs font-semibold text-slate-900 hover:underline"
                  >
                    Open →
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-4">
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; Safety
        </Link>
      </div>
    </div>
  );
}
