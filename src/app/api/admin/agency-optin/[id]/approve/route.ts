import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOptInApprovedEmail } from "@/lib/email/agency-optin-templates";
import { getGatesForUser } from "@/lib/agency-optin/server";
import { CURRENT_WORKER_B_VERSION } from "@/contracts";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/agency-optin/[id]/approve
 *
 * Admin one-click approve. Verifies the four gates are still green,
 * countersigns the worker_b contract on behalf of All Care 4 U, flips
 * status → active, fires welcome email, audit-logs.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, agency_opt_in_status, full_name")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      role: string;
      agency_opt_in_status: string;
      full_name: string | null;
    }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (profile.agency_opt_in_status !== "ready_for_review") {
    return NextResponse.json(
      { error: `Cannot approve from status ${profile.agency_opt_in_status}` },
      { status: 400 },
    );
  }

  const gates = await getGatesForUser(admin, id);
  if (!gates?.overall_ready) {
    return NextResponse.json(
      { error: "Gates no longer green", gates },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  // Record admin countersignature on the worker_b contract.
  await admin
    .from("organization_contracts")
    .update({
      status: "active",
      countersigned_by_admin_id: me.id,
      countersigned_at: now,
      effective_from: now,
    })
    .eq("signed_by_user_id", id)
    .eq("contract_type", "worker_b")
    .eq("version", CURRENT_WORKER_B_VERSION);

  const { error } = await admin
    .from("profiles")
    .update({
      agency_opt_in_status: "active",
      agency_opt_in_approved_at: now,
      agency_opt_in_approved_by: me.id,
      agency_opt_in_rejected_reason: null,
      agency_opt_in_paused_reason: null,
    })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    admin: me,
    action: "agency_optin.approve",
    targetType: "profile",
    targetId: id,
  });

  // Send welcome email.
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = authUser.user?.email ?? null;
  if (email) {
    const tpl = renderOptInApprovedEmail({
      name: (profile.full_name ?? "").trim() || "there",
    });
    await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) => console.error("[agency-optin.approve] email failed", e));
  }

  return NextResponse.json({ ok: true, status: "active" });
}
