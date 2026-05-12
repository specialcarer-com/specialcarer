import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAgencyOptinAudit } from "@/lib/agency-optin/server";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency-optin/population
 *
 * Body: { works_with_adults?: boolean, works_with_children?: boolean }
 *
 * Self-serve toggles for the population a carer wants to work with.
 *
 * Rules:
 *   - works_with_adults is fully self-serve.
 *   - works_with_children=true requires admin approval — we record the
 *     intent now (column flips to true) but the gate check refuses to
 *     turn green until works_with_children_admin_approved_at is set.
 *   - works_with_children=false (revoke) is self-serve, but we notify
 *     admins for audit + clear the admin_approved_at timestamp.
 *   - At least one of {adults, children} must be true after the change.
 *   - All changes are recorded in agency_optin_audit_log.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { works_with_adults?: unknown; works_with_children?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const adultsIn = body.works_with_adults;
  const childrenIn = body.works_with_children;
  if (adultsIn !== undefined && typeof adultsIn !== "boolean") {
    return NextResponse.json(
      { error: "works_with_adults must be boolean" },
      { status: 400 },
    );
  }
  if (childrenIn !== undefined && typeof childrenIn !== "boolean") {
    return NextResponse.json(
      { error: "works_with_children must be boolean" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "role, works_with_adults, works_with_children, works_with_children_admin_approved_at",
    )
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      works_with_adults: boolean;
      works_with_children: boolean;
      works_with_children_admin_approved_at: string | null;
    }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const newAdults =
    adultsIn === undefined ? profile.works_with_adults : adultsIn;
  const newChildren =
    childrenIn === undefined ? profile.works_with_children : childrenIn;

  if (!newAdults && !newChildren) {
    return NextResponse.json(
      {
        error:
          "You must select at least one of adults / children to remain eligible for agency opt-in.",
      },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  const auditRows: Array<{
    field: string;
    old_value: string;
    new_value: string;
  }> = [];

  if (newAdults !== profile.works_with_adults) {
    updates.works_with_adults = newAdults;
    auditRows.push({
      field: "works_with_adults",
      old_value: String(profile.works_with_adults),
      new_value: String(newAdults),
    });
  }

  let childToggledOn = false;
  let childToggledOff = false;
  if (newChildren !== profile.works_with_children) {
    updates.works_with_children = newChildren;
    auditRows.push({
      field: "works_with_children",
      old_value: String(profile.works_with_children),
      new_value: String(newChildren),
    });
    if (newChildren) {
      childToggledOn = true;
      // New intent — clear any prior admin approval; pending state.
      updates.works_with_children_admin_approved_at = null;
    } else {
      childToggledOff = true;
      updates.works_with_children_admin_approved_at = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const row of auditRows) {
    await logAgencyOptinAudit(admin, {
      carer_id: user.id,
      field: row.field,
      old_value: row.old_value,
      new_value: row.new_value,
      changed_by_user_id: user.id,
    });
  }

  // Audit-notify admins when works_with_children flips OFF (safeguarding-sensitive).
  if (childToggledOff && process.env.SAFEGUARDING_ADMIN_EMAIL) {
    await sendEmail({
      to: process.env.SAFEGUARDING_ADMIN_EMAIL,
      subject: "Carer revoked child-population opt-in",
      html: `<p>Carer <code>${user.id}</code> has revoked <strong>works_with_children</strong>. See agency_optin_audit_log for details.</p>`,
      text: `Carer ${user.id} has revoked works_with_children.`,
    }).catch((e) => console.error("[population] notify failed", e));
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    works_with_adults: newAdults,
    works_with_children: newChildren,
    child_pending_admin_approval: childToggledOn,
  });
}
