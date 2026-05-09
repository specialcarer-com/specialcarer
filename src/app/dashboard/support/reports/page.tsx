import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SAFETY_REPORT_TYPE_LABEL,
  SAFETY_SEVERITY_LABEL,
  type SafetyReport,
} from "@/lib/safety/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "My safety reports — SpecialCarer" };

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  triaging: "bg-amber-50 text-amber-800 border-amber-200",
  escalated: "bg-rose-50 text-rose-800 border-rose-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  dismissed: "bg-slate-100 text-slate-700 border-slate-200",
};

export default async function MySafetyReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/support/reports");

  const { data } = await supabase
    .from("safety_reports")
    .select(
      "id, booking_id, subject_user_id, report_type, severity, description, evidence_urls, status, admin_notes, resolved_by, resolved_at, created_at, reporter_user_id",
    )
    .eq("reporter_user_id", user.id)
    .order("created_at", { ascending: false });
  const list = (data ?? []) as SafetyReport[];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My safety reports</h1>
        <Link
          href="/dashboard/support"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Support
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          You haven&rsquo;t filed any safety reports.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl bg-white border border-slate-200 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {SAFETY_REPORT_TYPE_LABEL[r.report_type]}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Severity: {SAFETY_SEVERITY_LABEL[r.severity]} ·{" "}
                    {new Date(r.created_at).toLocaleString("en-GB")}
                  </p>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {r.description}
                  </p>
                  {r.admin_notes && (
                    <p className="mt-3 rounded-md bg-slate-50 border border-slate-200 p-2 text-xs text-slate-700">
                      <span className="font-semibold">Admin update:</span>{" "}
                      {r.admin_notes}
                    </p>
                  )}
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.open}`}
                >
                  {r.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
