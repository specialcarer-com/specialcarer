import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import {
  renderOrgAdminNotifyEmail,
  renderOrgSubmittedEmail,
} from "@/lib/email/templates";
import { getMyOrgMembership } from "@/lib/org/server";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL =
  process.env.ORG_ADMIN_EMAIL ?? "hello@specialcarer.com";

/**
 * POST /api/m/org/register/submit
 *
 * Final submit. Validates the basics are filled in, flips
 * verification_status='draft' → 'pending', stamps submitted_at, and
 * fires the booker confirmation + admin notification emails.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) {
    return NextResponse.json({ error: "no_org" }, { status: 400 });
  }

  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, country, org_type, legal_name, verification_status, submitted_at",
    )
    .eq("id", member.organization_id)
    .maybeSingle<{
      id: string;
      country: string | null;
      org_type: string | null;
      legal_name: string | null;
      verification_status: string;
      submitted_at: string | null;
    }>();
  if (!org) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!org.legal_name || !org.country || !org.org_type) {
    return NextResponse.json(
      { error: "missing_required_fields" },
      { status: 400 },
    );
  }
  if (org.verification_status === "verified") {
    return NextResponse.json(
      { error: "already_verified" },
      { status: 400 },
    );
  }

  const submittedAt = new Date().toISOString();
  await admin
    .from("organizations")
    .update({
      verification_status: "pending",
      submitted_at: submittedAt,
      updated_at: submittedAt,
    })
    .eq("id", org.id);

  // Best-effort emails — don't block the success response.
  const bookerName = member.full_name || "there";
  const bookerEmail = member.work_email || user.email || null;
  const submitted = renderOrgSubmittedEmail({
    bookerName,
    legalName: org.legal_name,
  });
  if (bookerEmail) {
    await sendEmail({
      to: bookerEmail,
      subject: submitted.subject,
      html: submitted.html,
      text: submitted.text,
    }).catch((e) => console.error("[org.submit] booker email failed", e));
  }
  const adminMail = renderOrgAdminNotifyEmail({
    legalName: org.legal_name,
    country: org.country ?? "",
    orgType: org.org_type ?? "",
    bookerEmail: bookerEmail ?? "(no booker email)",
    orgId: org.id,
  });
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: adminMail.subject,
    html: adminMail.html,
    text: adminMail.text,
  }).catch((e) => console.error("[org.submit] admin email failed", e));

  return NextResponse.json({ ok: true, organization_id: org.id });
}
