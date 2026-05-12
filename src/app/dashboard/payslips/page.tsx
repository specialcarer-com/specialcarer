import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { taxYearForDate } from "@/lib/payroll/tax-constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payslips — SpecialCarer" };

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

const STATUS_PILLS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  disputed: "bg-rose-100 text-rose-800",
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-100 text-slate-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft (preview)",
  confirmed: "Confirmed",
  disputed: "Disputed",
  paid: "Paid",
  pending: "Pending",
};

export default async function CarerPayslipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/payslips");

  const { data: payslips } = await supabase
    .from("org_carer_payouts")
    .select(
      "id, period_start, period_end, status, gross_pay_cents, paye_deducted_cents, ni_employee_cents, holiday_accrued_cents, net_pay_cents, run_id, dispute_flagged_at",
    )
    .eq("carer_id", user.id)
    .in("status", ["draft", "confirmed", "disputed", "paid", "pending"])
    .order("period_end", { ascending: false })
    .limit(24);

  const taxYear = taxYearForDate(new Date());
  const { data: pot } = await supabase
    .from("carer_holiday_pots")
    .select("accrued_cents, taken_cents, paid_out_cents")
    .eq("carer_id", user.id)
    .eq("tax_year", taxYear)
    .maybeSingle<{ accrued_cents: number; taken_cents: number; paid_out_cents: number }>();
  const potBalance = pot
    ? (pot.accrued_cents ?? 0) - (pot.taken_cents ?? 0) - (pot.paid_out_cents ?? 0)
    : 0;

  // Find current draft (if any) for the banner
  const draft = (payslips ?? []).find((p) => (p as { status: string }).status === "draft") as
    | { id: string; period_start: string; period_end: string; run_id: string | null }
    | undefined;
  let previewClose: string | null = null;
  if (draft?.run_id) {
    const { data: run } = await supabase
      .from("payroll_runs")
      .select("preview_closes_at, status")
      .eq("id", draft.run_id)
      .maybeSingle<{ preview_closes_at: string | null; status: string }>();
    previewClose = run?.preview_closes_at ?? null;
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 mt-2">Payslips</h1>

        {draft && (
          <div
            className="mt-4 rounded-2xl p-4 border"
            style={{ borderColor: "#F4A261", background: "#FFF6EB" }}
          >
            <div className="font-semibold" style={{ color: "#0E7C7B" }}>
              Draft payslip ready for review
            </div>
            <div className="text-sm text-slate-700 mt-1">
              Your draft for {draft.period_start} – {draft.period_end} is open
              for review.{" "}
              {previewClose
                ? `Review window closes ${new Date(previewClose).toLocaleString("en-GB")}.`
                : ""}{" "}
              If anything looks wrong — missing shift, wrong rate — flag a
              dispute before the run.
            </div>
            <Link
              href={`/dashboard/payslips/${draft.id}`}
              className="inline-block mt-3 rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ background: "#0E7C7B" }}
            >
              Open draft payslip →
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_280px] gap-6 mt-6">
          <div className="space-y-3">
            {(payslips ?? []).map((p) => {
              const pp = p as {
                id: string;
                period_start: string;
                period_end: string;
                status: string;
                gross_pay_cents: number;
                net_pay_cents: number;
              };
              return (
                <Link
                  key={pp.id}
                  href={`/dashboard/payslips/${pp.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">
                      {new Date(`${pp.period_start}T00:00:00Z`).toLocaleDateString("en-GB", {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </div>
                    <div className="text-xs text-slate-500">
                      {pp.period_start} → {pp.period_end}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Net pay</div>
                      <div className="font-semibold" style={{ color: "#0E7C7B" }}>
                        {gbp(pp.net_pay_cents ?? 0)}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILLS[pp.status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {STATUS_LABEL[pp.status] ?? pp.status}
                    </span>
                  </div>
                </Link>
              );
            })}
            {(!payslips || payslips.length === 0) && (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No payslips yet. Your first will appear once a payroll run
                completes.
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500 uppercase tracking-wider">
                Holiday pot · {taxYear}
              </div>
              <div className="mt-2 text-2xl font-semibold" style={{ color: "#0E7C7B" }}>
                {gbp(potBalance)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Accrued: {gbp(pot?.accrued_cents ?? 0)}
              </div>
              <div className="text-xs text-slate-500">
                Taken: {gbp(pot?.taken_cents ?? 0)}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                12.07% of your gross pay is accrued here as paid-leave entitlement.
                Request leave via your manager to draw it down.
              </p>
              <Link
                href="/dashboard/holiday-pot"
                className="mt-3 inline-block rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: "#0E7C7B" }}
              >
                Open holiday pot →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
