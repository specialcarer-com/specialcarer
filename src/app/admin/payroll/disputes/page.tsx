import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import DisputeResolver from "./dispute-resolver";

export const dynamic = "force-dynamic";

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

export default async function AdminPayrollDisputesPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_carer_payouts")
    .select(
      "id, carer_id, run_id, period_start, period_end, gross_pay_cents, net_pay_cents, dispute_reason, dispute_flagged_at",
    )
    .eq("status", "disputed")
    .is("dispute_resolved_at", null)
    .order("dispute_flagged_at", { ascending: false });

  const carerIds = (data ?? []).map((p) => (p as { carer_id: string }).carer_id);
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

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div>
        <Link href="/admin/payroll" className="text-sm text-slate-500 hover:text-slate-700">
          ← Payroll
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 mt-1">Payslip disputes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Resolve to either approve the carer's change (re-included in next
          run with corrections) or reject (re-confirmed for current run).
        </p>
      </div>

      <div className="space-y-3">
        {(data ?? []).map((p) => {
          const pp = p as {
            id: string;
            carer_id: string;
            period_start: string;
            period_end: string;
            gross_pay_cents: number;
            net_pay_cents: number;
            dispute_reason: string | null;
            dispute_flagged_at: string | null;
          };
          const prof = byId.get(pp.carer_id);
          return (
            <div
              key={pp.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">
                    {prof?.full_name ?? pp.carer_id.slice(0, 8)}
                    <span className="text-slate-400"> · </span>
                    <span className="text-slate-700 font-normal">
                      {pp.period_start} → {pp.period_end}
                    </span>
                  </div>
                  {prof?.email && <div className="text-xs text-slate-500">{prof.email}</div>}
                  {pp.dispute_flagged_at && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      flagged {new Date(pp.dispute_flagged_at).toLocaleString("en-GB")}
                    </div>
                  )}
                </div>
                <div className="text-right text-sm">
                  <div className="text-slate-500">Gross</div>
                  <div className="font-semibold text-slate-900">{gbp(pp.gross_pay_cents ?? 0)}</div>
                  <div className="text-slate-500 mt-1">Net (draft)</div>
                  <div className="font-semibold" style={{ color: "#0E7C7B" }}>
                    {gbp(pp.net_pay_cents ?? 0)}
                  </div>
                </div>
              </div>
              {pp.dispute_reason && (
                <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-900 whitespace-pre-wrap">
                  {pp.dispute_reason}
                </div>
              )}
              <div className="mt-4">
                <DisputeResolver payoutId={pp.id} />
              </div>
            </div>
          );
        })}
        {(!data || data.length === 0) && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No open disputes.
          </div>
        )}
      </div>
    </div>
  );
}
