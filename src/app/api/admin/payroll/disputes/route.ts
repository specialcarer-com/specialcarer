import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/payroll/disputes — list disputed payouts pending resolution */
export async function GET() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("org_carer_payouts")
    .select(
      "id, carer_id, run_id, period_start, period_end, gross_pay_cents, net_pay_cents, dispute_reason, dispute_flagged_at, dispute_resolved_at, status",
    )
    .eq("status", "disputed")
    .is("dispute_resolved_at", null)
    .order("dispute_flagged_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const carerIds = Array.from(
    new Set((data ?? []).map((p) => (p as { carer_id: string }).carer_id)),
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
    disputes: (data ?? []).map((p) => {
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
