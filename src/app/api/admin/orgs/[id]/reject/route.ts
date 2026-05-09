import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOrgRejectedEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

type Body = { reason?: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await requireAdmin();
  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if (!reason) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, legal_name")
    .eq("id", id)
    .maybeSingle<{ id: string; legal_name: string | null }>();
  if (!org) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("organizations")
    .update({
      verification_status: "rejected",
      rejection_reason: reason,
      booking_enabled: false,
      verified_by: me.id,
      verified_at: null,
      updated_at: now,
    })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: owner } = await admin
    .from("organization_members")
    .select("full_name, work_email")
    .eq("organization_id", id)
    .eq("role", "owner")
    .maybeSingle<{ full_name: string | null; work_email: string | null }>();
  if (owner?.work_email) {
    const tpl = renderOrgRejectedEmail({
      bookerName: owner.full_name ?? "there",
      legalName: org.legal_name ?? "your organisation",
      reason,
    });
    await sendEmail({
      to: owner.work_email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    }).catch((e) => console.error("[org.reject] email failed", e));
  }
  return NextResponse.json({ ok: true });
}
