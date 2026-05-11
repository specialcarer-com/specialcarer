import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOptInResumedEmail } from "@/lib/email/agency-optin-templates";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, full_name, agency_opt_in_status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      role: string;
      full_name: string | null;
      agency_opt_in_status: string;
    }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (profile.agency_opt_in_status !== "paused") {
    return NextResponse.json(
      { error: `Can only resume paused carers (current: ${profile.agency_opt_in_status})` },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("profiles")
    .update({
      agency_opt_in_status: "active",
      agency_opt_in_paused_reason: null,
    })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    admin: me,
    action: "agency_optin.resume",
    targetType: "profile",
    targetId: id,
  });

  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = authUser.user?.email ?? null;
  if (email) {
    const tpl = renderOptInResumedEmail({
      name: (profile.full_name ?? "").trim() || "there",
    });
    await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) => console.error("[agency-optin.resume] email failed", e));
  }

  return NextResponse.json({ ok: true, status: "active" });
}
