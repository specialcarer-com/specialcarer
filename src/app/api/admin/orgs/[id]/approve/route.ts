import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOrgApprovedEmail } from "@/lib/email/templates";
import { renderContractPdf } from "@/lib/contracts/pdf";
import { getContractMarkdown } from "@/contracts";

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

  // Countersign every contract this org has signed: render the PDF
  // (org signature + admin countersignature), upload to storage, and
  // flip status → countersigned → active.
  const { data: contractRows } = await admin
    .from("organization_contracts")
    .select(
      "id, contract_type, version, status, signed_by_name, signed_by_role, signed_at, signature_ip, legal_review_comment",
    )
    .eq("organization_id", id);
  type CRow = {
    id: string;
    contract_type: "msa" | "dpa";
    version: string;
    status: string;
    signed_by_name: string | null;
    signed_by_role: string | null;
    signed_at: string | null;
    signature_ip: string | null;
    legal_review_comment: string | null;
  };
  const counterTime = new Date();
  for (const row of (contractRows ?? []) as CRow[]) {
    if (row.status !== "signed" && row.status !== "countersigned") continue;
    try {
      const md = getContractMarkdown(row.version);
      const pdf = await renderContractPdf({
        contractType: row.contract_type,
        version: row.version,
        markdown: md,
        organizationName: org.legal_name ?? "Customer",
        signedByName: row.signed_by_name,
        signedByRole: row.signed_by_role,
        signedAt: row.signed_at ? new Date(row.signed_at) : null,
        signatureIp: row.signature_ip,
        countersignName: me.email ?? "SpecialCarer Admin",
        countersignedAt: counterTime,
        legalReviewComment: row.legal_review_comment,
      });
      const path = `${id}/contracts/${row.contract_type}-${row.version}.pdf`;
      const { error: upErr } = await admin.storage
        .from("organization-documents")
        .upload(path, Buffer.from(pdf), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (upErr) {
        console.error("[org.approve] pdf upload failed", upErr);
        continue;
      }
      await admin
        .from("organization_contracts")
        .update({
          status: "active",
          signed_pdf_storage_path: path,
          countersigned_by_admin_id: me.id,
          countersigned_at: counterTime.toISOString(),
          effective_from: counterTime.toISOString(),
        })
        .eq("id", row.id);
    } catch (e) {
      console.error(
        "[org.approve] countersign failed",
        row.contract_type,
        row.version,
        e,
      );
    }
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
