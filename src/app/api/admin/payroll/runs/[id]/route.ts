import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/payroll/runs/[id] — run detail with per-carer payouts */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: run, error } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: payouts } = await admin
    .from("org_carer_payouts")
    .select(
      "id, carer_id, status, booking_count, gross_pay_cents, paye_deducted_cents, ni_employee_cents, ni_employer_cents, holiday_accrued_cents, net_pay_cents, tax_code, dispute_reason, dispute_flagged_at, payslip_pdf_url",
    )
    .eq("run_id", id);

  const carerIds = Array.from(
    new Set((payouts ?? []).map((p) => (p as { carer_id: string }).carer_id)),
  );
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

  return NextResponse.json({
    run,
    payouts: (payouts ?? []).map((p) => {
      const pp = p as Record<string, unknown>;
      const cid = pp.carer_id as string;
      const profile = byId.get(cid);
      return {
        ...pp,
        carer_name: profile?.full_name ?? null,
        carer_email: profile?.email ?? null,
      };
    }),
  });
}
