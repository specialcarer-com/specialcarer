import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/carer/payslips — list own payslips (drafts + finalised) */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("org_carer_payouts")
    .select(
      "id, period_start, period_end, status, gross_pay_cents, paye_deducted_cents, ni_employee_cents, holiday_accrued_cents, net_pay_cents, tax_code, tax_year, dispute_reason, dispute_flagged_at, payslip_pdf_url, run_id, created_at",
    )
    .eq("carer_id", user.id)
    .in("status", ["draft", "confirmed", "disputed", "paid", "pending"])
    .order("period_end", { ascending: false })
    .limit(36);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ payslips: data ?? [] });
}
