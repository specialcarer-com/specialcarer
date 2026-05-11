import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/timeoff
 * List all time-off requests. Defaults to status=pending; pass ?status=all for all.
 */
export async function GET(req: Request) {
  const _adminGuard = await requireAdminApi();

  if (!_adminGuard.ok) return _adminGuard.response;
  const admin = createAdminClient();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  let q = admin
    .from("caregiver_timeoff_requests")
    .select(
      `id, user_id, starts_on, ends_on, reason, status, review_note, reviewed_at,
       created_at,
       profiles:user_id (first_name, last_name, avatar_url)`
    )
    .order("starts_on");

  if (status !== "all") {
    q = q.eq("status", status);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}
