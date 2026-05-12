import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAgencyOptinAudit } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/agency-optin/child-opt-ins/[id]/reject
 *
 * Admin one-click reject: reverts works_with_children to false and clears
 * works_with_children_admin_approved_at. Logged in audit log.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const me = guard.admin;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, role, works_with_adults, works_with_children, works_with_children_admin_approved_at",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      role: string;
      works_with_adults: boolean;
      works_with_children: boolean;
      works_with_children_admin_approved_at: string | null;
    }>();

  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!profile.works_with_children) {
    return NextResponse.json(
      { error: "Carer is not opted in to child population" },
      { status: 400 },
    );
  }
  // Defensive: if rejecting child population would leave them serving nothing,
  // make sure adults is on. Otherwise they'd be ineligible and the row state
  // would be invalid.
  const updates: Record<string, unknown> = {
    works_with_children: false,
    works_with_children_admin_approved_at: null,
  };
  if (!profile.works_with_adults) {
    updates.works_with_adults = true;
  }

  const { error } = await admin.from("profiles").update(updates).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAgencyOptinAudit(admin, {
    carer_id: id,
    field: "works_with_children",
    old_value: "true",
    new_value: "false",
    changed_by_user_id: me.id,
  });
  await logAdminAction({
    admin: me,
    action: "agency_optin.child_population.reject",
    targetType: "profile",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
