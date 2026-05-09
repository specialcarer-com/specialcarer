import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/org/me
 *
 * Returns the calling user's org context — the row, members,
 * documents, and billing (with signed URLs for any uploaded docs so
 * the dashboard can preview without an extra round-trip).
 */
export async function GET() {
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
    return NextResponse.json({ org: null });
  }
  const orgRow = await getOrg(admin, member.organization_id);
  if (!orgRow) {
    return NextResponse.json({ org: null });
  }

  const [membersRes, docsRes, billingRes] = await Promise.all([
    admin
      .from("organization_members")
      .select(
        "id, user_id, role, full_name, work_email, phone, job_title, job_title_other, is_signatory",
      )
      .eq("organization_id", orgRow.id),
    admin
      .from("organization_documents")
      .select(
        "id, kind, storage_path, filename, mime_type, uploaded_at, verified, rejection_reason",
      )
      .eq("organization_id", orgRow.id)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("organization_billing")
      .select(
        "billing_contact_name, billing_contact_email, billing_address, po_required, po_mode, default_terms",
      )
      .eq("organization_id", orgRow.id)
      .maybeSingle(),
  ]);

  // Sign URLs for previews (1h TTL).
  type DocRow = {
    id: string;
    kind: string;
    storage_path: string;
    filename: string | null;
    mime_type: string | null;
    uploaded_at: string;
    verified: boolean;
    rejection_reason: string | null;
  };
  const docs = await Promise.all(
    ((docsRes.data ?? []) as DocRow[]).map(async (d) => {
      let signed: string | null = null;
      try {
        const { data: s } = await admin.storage
          .from("organization-documents")
          .createSignedUrl(d.storage_path, 3600);
        signed = s?.signedUrl ?? null;
      } catch {
        signed = null;
      }
      return { ...d, signed_url: signed };
    }),
  );

  return NextResponse.json({
    org: orgRow,
    me: member,
    members: membersRes.data ?? [],
    documents: docs,
    billing: billingRes.data ?? null,
  });
}
