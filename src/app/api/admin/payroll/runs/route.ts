import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/payroll/runs — list recent payroll runs */
export async function GET() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payroll_runs")
    .select(
      "id, period_start, period_end, scheduled_run_date, status, preview_opens_at, preview_closes_at, carer_count, total_gross_cents, total_net_cents, total_paye_cents, total_ni_employer_cents, actual_run_completed_at, created_at",
    )
    .order("scheduled_run_date", { ascending: false })
    .limit(24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
