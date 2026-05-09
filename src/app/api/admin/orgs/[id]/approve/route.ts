import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOrgApprovedEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: org } = await admin
    .from("organizations")
    .select("id, legal_name, verification_status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      legal_name: string | null;
      verification_status: string;
    }>();
  if (!org) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { error } = await admin
    .from("organizations")
    .update({
      verification_status: "verified",
      verified_at: now,
      verified_by: me.id,
      booking_enabled: true,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the org's owner (booker) + billing contact.
  const { data: owner } = await admin
    .from("organization_members")
    .select("user_id, full_name, work_email")
    .eq("organization_id", id)
    .eq("role", "owner")
    .maybeSingle<{
      user_id: string;
      full_name: string | null;
      work_email: string | null;
    }>();
  const { data: billing } = await admin
    .from("organization_billing")
    .select("billing_contact_email")
    .eq("organization_id", id)
    .maybeSingle<{ billing_contact_email: string | null }>();

  const tpl = renderOrgApprovedEmail({
    bookerName: owner?.full_name ?? "there",
    legalName: org.legal_name ?? "your organisation",
  });
  const recipients = new Set<string>();
  if (owner?.work_email) recipients.add(owner.work_email);
  if (billing?.billing_contact_email)
    recipients.add(billing.billing_contact_email);
  for (const to of recipients) {
    await sendEmail({
      to,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) => console.error("[org.approve] email failed", to, e));
  }
  return NextResponse.json({ ok: true });
}
