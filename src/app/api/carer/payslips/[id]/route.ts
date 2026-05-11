import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/carer/payslips/[id]
 *
 * Returns the payslip detail PLUS a signed download URL for the PDF (valid
 * for 1 hour). The PDF lives in the private 'payslips' Supabase storage
 * bucket; we use the admin client to sign because the storage RLS isn't
 * wired for owner-by-folder-prefix on private buckets.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { data: payslip, error } = await supabase
    .from("org_carer_payouts")
    .select(
      "id, carer_id, period_start, period_end, status, gross_pay_cents, paye_deducted_cents, ni_employee_cents, ni_employer_cents, holiday_accrued_cents, net_pay_cents, tax_code, tax_year, dispute_reason, dispute_flagged_at, payslip_pdf_url, run_id, booking_count",
    )
    .eq("id", id)
    .eq("carer_id", user.id)
    .maybeSingle();
  if (error || !payslip) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("org_carer_payout_items")
    .select("booking_id, carer_pay_cents")
    .eq("payout_id", id);

  // Bring the run info (so the UI can show preview_closes_at).
  const runId = (payslip as { run_id: string | null }).run_id;
  let run: unknown = null;
  if (runId) {
    const { data: r } = await supabase
      .from("payroll_runs")
      .select(
        "id, status, scheduled_run_date, preview_opens_at, preview_closes_at",
      )
      .eq("id", runId)
      .maybeSingle();
    run = r;
  }

  // Signed PDF URL
  const pdfPath = (payslip as { payslip_pdf_url: string | null }).payslip_pdf_url;
  let signedUrl: string | null = null;
  if (pdfPath) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("payslips")
      .createSignedUrl(pdfPath, 60 * 60);
    signedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    payslip,
    items: items ?? [],
    run,
    pdf_url: signedUrl,
  });
}
