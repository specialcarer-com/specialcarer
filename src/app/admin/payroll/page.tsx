import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

const STATUS_PILLS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  preview_open: "bg-amber-100 text-amber-800",
  preview_closed: "bg-slate-100 text-slate-800",
  running: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

export default async function AdminPayrollPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: runs } = await admin
    .from("payroll_runs")
    .select(
      "id, period_start, period_end, scheduled_run_date, status, preview_opens_at, preview_closes_at, carer_count, total_gross_cents, total_net_cents, total_paye_cents, total_ni_employer_cents",
    )
    .order("scheduled_run_date", { ascending: false })
    .limit(18);

  const { count: openDisputes } = await admin
    .from("org_carer_payouts")
    .select("id", { count: "exact", head: true })
    .eq("status", "disputed")
    .is("dispute_resolved_at", null);

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payroll</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monthly PAYE payroll for carers — runs on the 15th of each UK month
            (adjusted for weekends/bank holidays). 72-hour preview window
            opens before each run.
          </p>
        </div>
        <Link
          href="/admin/payroll/disputes"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span>Disputes</span>
          {openDisputes && openDisputes > 0 ? (
            <span className="inline-flex items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs px-2 min-w-[1.5rem] h-5">
              {openDisputes}
            </span>
          ) : null}
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Period</th>
              <th className="text-left px-4 py-3">Run date</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Carers</th>
              <th className="text-right px-4 py-3">Gross</th>
              <th className="text-right px-4 py-3">Net</th>
              <th className="text-right px-4 py-3">PAYE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(runs ?? []).map((r) => {
              const rr = r as {
                id: string;
                period_start: string;
                period_end: string;
                scheduled_run_date: string;
                status: string;
                carer_count: number | null;
                total_gross_cents: number | null;
                total_net_cents: number | null;
                total_paye_cents: number | null;
              };
              return (
                <tr key={rr.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{rr.period_start}</span>
                    <span className="text-slate-400"> → </span>
                    <span className="text-slate-700">{rr.period_end}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{rr.scheduled_run_date}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILLS[rr.status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {rr.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{rr.carer_count ?? 0}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{gbp(rr.total_gross_cents ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{gbp(rr.total_net_cents ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{gbp(rr.total_paye_cents ?? 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/payroll/${rr.id}`}
                      className="text-sm font-medium"
                      style={{ color: "#0E7C7B" }}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!runs || runs.length === 0) && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={8}>
                  No payroll runs yet. The cron will schedule the next run automatically.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
