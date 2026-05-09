import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOrgRequestInfoEmail } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

type Body = { message?: string };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
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
  const { data: owner } = await admin
    .from("organization_members")
    .select("full_name, work_email")
    .eq("organization_id", id)
    .eq("role", "owner")
    .maybeSingle<{ full_name: string | null; work_email: string | null }>();
  if (!owner?.work_email) {
    return NextResponse.json(
      { error: "no_owner_email" },
      { status: 400 },
    );
  }

  const tpl = renderOrgRequestInfoEmail({
    bookerName: owner.full_name ?? "there",
    legalName: org.legal_name ?? "your organisation",
    message,
  });
  await sendEmail({
    to: owner.work_email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  }).catch((e) => console.error("[org.request-info] email failed", e));

  // Status stays 'pending' — we just nudged them.
  await admin
    .from("organizations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
