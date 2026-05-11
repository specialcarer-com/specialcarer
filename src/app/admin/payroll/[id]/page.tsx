import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import TriggerButtons from "./trigger-buttons";

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
  draft: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  disputed: "bg-rose-50 text-rose-700",
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-100 text-slate-700",
};

export default async function AdminPayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!run) notFound();
  const rr = run as Record<string, unknown>;

  const { data: payouts } = await admin
    .from("org_carer_payouts")
    .select(
      "id, carer_id, status, booking_count, gross_pay_cents, paye_deducted_cents, ni_employee_cents, ni_employer_cents, holiday_accrued_cents, net_pay_cents, dispute_reason",
    )
    .eq("run_id", id);

  const carerIds = (payouts ?? []).map((p) => (p as { carer_id: string }).carer_id);
  const { data: profiles } = carerIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", carerIds)
    : { data: [] };
  const byId = new Map(
    (profiles ?? []).map((p) => [
      (p as { id: string }).id,
      p as { id: string; full_name: string | null; email: string | null },
    ]),
  );

  const runStatus = rr.status as string;

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/payroll" className="text-sm text-slate-500 hover:text-slate-700">
            ← All runs
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">
            Payroll run · {String(rr.period_start)} → {String(rr.period_end)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Scheduled for{" "}
            <span className="font-medium text-slate-700">
              {String(rr.scheduled_run_date)}
            </span>
            {" · "}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILLS[runStatus] ?? "bg-slate-100 text-slate-700"}`}
            >
              {runStatus}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/payroll/runs/${id}/bacs-csv`}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Download BACS CSV
          </a>
          <TriggerButtons runId={id} status={runStatus} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Carers" value={String(rr.carer_count ?? 0)} />
        <Kpi label="Gross" value={gbp(Number(rr.total_gross_cents ?? 0))} />
        <Kpi label="PAYE" value={gbp(Number(rr.total_paye_cents ?? 0))} />
        <Kpi
          label="Employer NI"
          value={gbp(Number(rr.total_ni_employer_cents ?? 0))}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Kpi label="Net (to carers)" value={gbp(Number(rr.total_net_cents ?? 0))} tone="good" />
        <Kpi
          label="Preview window"
          value={
            rr.preview_opens_at
              ? `Opens ${new Date(String(rr.preview_opens_at)).toLocaleString("en-GB")}`
              : "—"
          }
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
          Per-carer payouts
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2">Carer</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Bookings</th>
              <th className="text-right px-4 py-2">Gross</th>
              <th className="text-right px-4 py-2">PAYE</th>
              <th className="text-right px-4 py-2">NI</th>
              <th className="text-right px-4 py-2">Holiday</th>
              <th className="text-right px-4 py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {(payouts ?? []).map((p) => {
              const pp = p as {
                id: string;
                carer_id: string;
                status: string;
                booking_count: number;
                gross_pay_cents: number;
                paye_deducted_cents: number;
                ni_employee_cents: number;
                holiday_accrued_cents: number;
                net_pay_cents: number;
                dispute_reason: string | null;
              };
              const prof = byId.get(pp.carer_id);
              return (
                <tr key={pp.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{prof?.full_name ?? pp.carer_id.slice(0, 8)}</div>
                    {prof?.email && <div className="text-xs text-slate-500">{prof.email}</div>}
                    {pp.dispute_reason && (
                      <div className="text-xs text-rose-600 mt-1">⚠ {pp.dispute_reason}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILLS[pp.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {pp.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{pp.booking_count}</td>
                  <td className="px-4 py-2 text-right">{gbp(pp.gross_pay_cents ?? 0)}</td>
                  <td className="px-4 py-2 text-right">{gbp(pp.paye_deducted_cents ?? 0)}</td>
                  <td className="px-4 py-2 text-right">{gbp(pp.ni_employee_cents ?? 0)}</td>
                  <td className="px-4 py-2 text-right">{gbp(pp.holiday_accrued_cents ?? 0)}</td>
                  <td className="px-4 py-2 text-right font-medium" style={{ color: "#0E7C7B" }}>
                    {gbp(pp.net_pay_cents ?? 0)}
                  </td>
                </tr>
              );
            })}
            {(!payouts || payouts.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No payouts yet for this run — trigger preview to compute drafts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  const ring = tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border ${ring} p-4`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
