import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOptInPausedEmail } from "@/lib/email/agency-optin-templates";

export const dynamic = "force-dynamic";

type Body = { reason?: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const _adminGuard_me = await requireAdminApi();

  if (!_adminGuard_me.ok) return _adminGuard_me.response;

  const me = _adminGuard_me.admin;
  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 5) {
    return NextResponse.json(
      { error: "Please provide a reason (at least 5 characters)" },
      { status: 400 },
    );
  }

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
  if (profile.agency_opt_in_status !== "active") {
    return NextResponse.json(
      { error: `Can only pause active carers (current: ${profile.agency_opt_in_status})` },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("profiles")
    .update({
      agency_opt_in_status: "paused",
      agency_opt_in_paused_reason: reason,
    })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    admin: me,
    action: "agency_optin.pause",
    targetType: "profile",
    targetId: id,
    details: { reason },
  });

  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = authUser.user?.email ?? null;
  if (email) {
    const tpl = renderOptInPausedEmail({
      name: (profile.full_name ?? "").trim() || "there",
      reason,
    });
    await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) => console.error("[agency-optin.pause] email failed", e));
  }

  return NextResponse.json({ ok: true, status: "paused" });
}
