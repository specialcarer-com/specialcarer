import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAgencyOptinAudit } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/agency-optin/child-opt-ins/[id]/approve
 *
 * Admin one-click approve: stamps works_with_children_admin_approved_at = now.
 * The training gate becomes satisfiable once the carer also passes
 * safeguarding-children.
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
    .select("id, role, works_with_children, works_with_children_admin_approved_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      role: string;
      works_with_children: boolean;
      works_with_children_admin_approved_at: string | null;
    }>();

  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!profile.works_with_children) {
    return NextResponse.json(
      { error: "Carer has not opted in to child population" },
      { status: 400 },
    );
  }
  if (profile.works_with_children_admin_approved_at) {
    return NextResponse.json({ ok: true, already_approved: true });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({ works_with_children_admin_approved_at: now })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAgencyOptinAudit(admin, {
    carer_id: id,
    field: "works_with_children_admin_approved_at",
    old_value: null,
    new_value: now,
    changed_by_user_id: me.id,
  });
  await logAdminAction({
    admin: me,
    action: "agency_optin.child_population.approve",
    targetType: "profile",
    targetId: id,
  });

  return NextResponse.json({ ok: true, approved_at: now });
}
