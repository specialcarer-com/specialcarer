import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agency-optin/child-opt-ins
 *
 * Mini-queue: carers who have set works_with_children = true but are still
 * awaiting admin approval (works_with_children_admin_approved_at IS NULL).
 */
export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, full_name, country, works_with_adults, works_with_children, works_with_children_admin_approved_at, agency_opt_in_status",
    )
    .eq("role", "caregiver")
    .eq("works_with_children", true)
    .is("works_with_children_admin_approved_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
