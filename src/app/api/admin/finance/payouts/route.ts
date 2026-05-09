import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYOUT_STATUSES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/payouts
 * Optional filters: ?status=pending|processing|paid|failed|on_hold
 *                   ?caregiver_id=<uuid>
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const caregiverId = url.searchParams.get("caregiver_id");

  const admin = createAdminClient();
  let q = admin
    .from("payouts")
    .select(
      "id, caregiver_id, period_start, period_end, gross, fees, net, status, stripe_payout_id, scheduled_for, paid_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (status && (PAYOUT_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (caregiverId) q = q.eq("caregiver_id", caregiverId);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ payouts: data ?? [] });
}
