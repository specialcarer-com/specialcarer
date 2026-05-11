import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import DisputeForm from "./dispute-form";

export const dynamic = "force-dynamic";

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft (preview)",
  confirmed: "Confirmed",
  disputed: "Disputed",
  paid: "Paid",
  pending: "Pending",
};

export default async function CarerPayslipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { data: payslip } = await supabase
    .from("org_carer_payouts")
    .select(
      "id, carer_id, period_start, period_end, status, gross_pay_cents, paye_deducted_cents, ni_employee_cents, ni_employer_cents, holiday_accrued_cents, net_pay_cents, tax_code, run_id, payslip_pdf_url, dispute_reason, dispute_flagged_at",
    )
    .eq("id", id)
    .eq("carer_id", user.id)
    .maybeSingle();
  if (!payslip) notFound();

  const pp = payslip as {
    id: string;
    period_start: string;
    period_end: string;
    status: string;
    gross_pay_cents: number;
    paye_deducted_cents: number;
    ni_employee_cents: number;
    ni_employer_cents: number;
    holiday_accrued_cents: number;
    net_pay_cents: number;
    tax_code: string | null;
    run_id: string | null;
    payslip_pdf_url: string | null;
    dispute_reason: string | null;
  };

  let pdfUrl: string | null = null;
  if (pp.payslip_pdf_url) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("payslips")
      .createSignedUrl(pp.payslip_pdf_url, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  let canDispute = false;
  let previewClosesAt: string | null = null;
  if (pp.run_id && pp.status === "draft") {
    const { data: run } = await supabase
      .from("payroll_runs")
      .select("status, preview_closes_at")
      .eq("id", pp.run_id)
      .maybeSingle<{ status: string; preview_closes_at: string | null }>();
    if (run?.status === "preview_open") {
      previewClosesAt = run.preview_closes_at;
      canDispute = !previewClosesAt || new Date(previewClosesAt) > new Date();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/dashboard/payslips" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to payslips
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 mt-2">
          Payslip · {pp.period_start} – {pp.period_end}
        </h1>
        <div className="mt-1 text-sm text-slate-500">
          Status: <span className="font-medium text-slate-700">{STATUS_LABEL[pp.status] ?? pp.status}</span>
          {pp.tax_code && (
            <span>
              {" · "}Tax code <span className="font-medium text-slate-700">{pp.tax_code}</span>
            </span>
          )}
        </div>

        {pp.status === "disputed" && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Dispute flagged</div>
            <div className="whitespace-pre-wrap mt-1">{pp.dispute_reason ?? ""}</div>
            <p className="mt-2 text-rose-800/80">
              We've removed this payout from the upcoming run. An admin will
              investigate and follow up shortly.
            </p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <Row label="Gross pay" value={gbp(pp.gross_pay_cents)} kind="credit" />
          <Row label="PAYE income tax" value={`− ${gbp(pp.paye_deducted_cents)}`} kind="debit" />
          <Row label="NI (employee)" value={`− ${gbp(pp.ni_employee_cents)}`} kind="debit" />
          <Row label="Holiday accrued (12.07%)" value={gbp(pp.holiday_accrued_cents)} kind="info" />
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="font-semibold text-lg" style={{ color: "#0E7C7B" }}>
              Net pay
            </div>
            <div className="text-2xl font-bold" style={{ color: "#0E7C7B" }}>
              {gbp(pp.net_pay_cents)}
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-500 text-right">
            Employer NI of {gbp(pp.ni_employer_cents)} is contributed by your employer (not deducted from your pay).
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ background: "#0E7C7B" }}
            >
              Download payslip PDF
            </a>
          ) : (
            <span className="text-sm text-slate-500">PDF still generating…</span>
          )}
          {canDispute && (
            <DisputeForm
              payslipId={pp.id}
              previewClosesAt={previewClosesAt}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind: "credit" | "debit" | "info";
}) {
  const color = kind === "debit" ? "text-slate-700" : kind === "info" ? "text-slate-500" : "text-slate-900 font-semibold";
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-sm text-slate-700">{label}</div>
      <div className={`text-sm ${color}`}>{value}</div>
    </div>
  );
}
