import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FORUM_REPORT_STATUSES } from "@/lib/community/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/community/reports?status=open
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const admin = createAdminClient();

  let q = admin
    .from("forum_reports")
    .select(
      "id, reporter_user_id, thread_id, post_id, reason, description, status, resolved_by, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (
    status &&
    (FORUM_REPORT_STATUSES as readonly string[]).includes(status)
  ) {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data ?? [] });
}
