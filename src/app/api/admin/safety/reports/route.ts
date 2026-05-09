import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SAFETY_REPORT_STATUSES } from "@/lib/safety/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/safety/reports?status=open
 * Admin-only listing across all carers' safety reports.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const admin = createAdminClient();

  let q = admin
    .from("safety_reports")
    .select(
      "id, reporter_user_id, booking_id, subject_user_id, report_type, severity, description, evidence_urls, status, admin_notes, resolved_by, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (
    status &&
    (SAFETY_REPORT_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data ?? [] });
}
