import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FRAUD_SIGNAL_STATUSES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/fraud?status=new&severity=4
 * List fraud signals, filterable by status (new|reviewing|cleared|confirmed)
 * and minimum severity (1-5).
 */
export async function GET(req: Request) {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");

  const admin = createAdminClient();
  let q = admin
    .from("fraud_signals")
    .select(
      "id, subject_type, subject_id, signal_type, severity, details, status, flagged_at, reviewed_by, reviewed_at",
    )
    .order("flagged_at", { ascending: false })
    .limit(500);
  if (status && (FRAUD_SIGNAL_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (severity) {
    const n = Number(severity);
    if (Number.isInteger(n) && n >= 1 && n <= 5) {
      q = q.gte("severity", n);
    }
  }
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ signals: data ?? [] });
}
