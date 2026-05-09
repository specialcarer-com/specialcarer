import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SAFETY_REPORT_TYPE_LABEL,
  SAFETY_SEVERITY_LABEL,
  type SafetyReport,
} from "@/lib/safety/types";
import SafetyReportActions from "./SafetyReportActions";

export const dynamic = "force-dynamic";

export default async function AdminSafetyReportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: report } = await admin
    .from("safety_reports")
    .select(
      "id, reporter_user_id, booking_id, subject_user_id, report_type, severity, description, evidence_urls, status, admin_notes, resolved_by, resolved_at, created_at",
    )
    .eq("id", id)
    .maybeSingle<SafetyReport>();
  if (!report) notFound();

  const userIds = [report.reporter_user_id];
  if (report.subject_user_id) userIds.push(report.subject_user_id);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .in("id", userIds);
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );
  const reporter = profileById.get(report.reporter_user_id);
  const subject = report.subject_user_id
    ? profileById.get(report.subject_user_id)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Safety report</h1>
        <Link
          href="/admin/trust-safety/safety-reports"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to queue
        </Link>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Type
            </p>
            <p className="text-slate-900 font-semibold">
              {SAFETY_REPORT_TYPE_LABEL[report.report_type]}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Severity
            </p>
            <p className="text-slate-900 font-semibold">
              {SAFETY_SEVERITY_LABEL[report.severity]}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Reporter
            </p>
            <p className="text-slate-900">
              {reporter?.full_name ?? report.reporter_user_id.slice(0, 8)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Subject
            </p>
            <p className="text-slate-900">
              {subject?.full_name ?? (report.subject_user_id ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Booking
            </p>
            <p className="text-slate-900">
              {report.booking_id ? (
                <Link
                  href={`/dashboard/bookings/${report.booking_id}`}
                  className="text-teal-700 hover:underline"
                >
                  {report.booking_id.slice(0, 8)} →
                </Link>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Filed
            </p>
            <p className="text-slate-900">
              {new Date(report.created_at).toLocaleString("en-GB")}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            Description
          </p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap mt-1">
            {report.description}
          </p>
        </div>
        {report.evidence_urls.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Evidence
            </p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {report.evidence_urls.map((u) => (
                <li key={u}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-700 hover:underline break-all"
                  >
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <SafetyReportActions
        reportId={report.id}
        initialStatus={report.status}
        initialNotes={report.admin_notes}
      />
    </div>
  );
}
