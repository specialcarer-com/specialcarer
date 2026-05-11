import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agency-optin/queue
 *
 * Lists carers currently in `ready_for_review`. Optional ?status=active|paused|rejected
 * lets the same endpoint power the other tabs.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "ready_for_review";
  if (
    !["ready_for_review", "active", "paused", "rejected", "in_progress"].includes(
      status,
    )
  ) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: gates, error } = await admin
    .from("v_agency_opt_in_gates")
    .select("*")
    .eq("agency_opt_in_status", status)
    .order("agency_opt_in_submitted_at", {
      ascending: true,
      nullsFirst: false,
    });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = (gates ?? []).map((g: { user_id: string }) => g.user_id);
  type ProfileRow = {
    id: string;
    full_name: string | null;
    country: string | null;
  };
  let profiles: ProfileRow[] = [];
  if (userIds.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, country")
      .in("id", userIds);
    profiles = (data ?? []) as ProfileRow[];
  }
  const profById = new Map(profiles.map((p) => [p.id, p]));

  const rows = (gates ?? []).map((g: { user_id: string }) => ({
    ...g,
    full_name: profById.get(g.user_id)?.full_name ?? null,
    country: profById.get(g.user_id)?.country ?? null,
  }));

  return NextResponse.json({ rows });
}
