import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  contract_type: "msa" | "dpa";
  version: string;
  status: string;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_role: string | null;
  countersigned_at: string | null;
  effective_from: string | null;
  effective_to: string | null;
  signed_pdf_storage_path: string | null;
};

/**
 * GET /api/m/org/contracts
 *
 * Returns the calling user's org's signed contracts with fresh signed
 * URLs (1h) for the countersigned PDFs where present.
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
    return NextResponse.json({ contracts: [] });
  }
  const { data } = await admin
    .from("organization_contracts")
    .select(
      "id, contract_type, version, status, signed_at, signed_by_name, signed_by_role, countersigned_at, effective_from, effective_to, signed_pdf_storage_path",
    )
    .eq("organization_id", member.organization_id)
    .order("contract_type", { ascending: true });
  const rows = (data ?? []) as Row[];
  const enriched = await Promise.all(
    rows.map(async (r) => {
      let signed_url: string | null = null;
      if (r.signed_pdf_storage_path) {
        try {
          const { data: s } = await admin.storage
            .from("organization-documents")
            .createSignedUrl(r.signed_pdf_storage_path, 3600);
          signed_url = s?.signedUrl ?? null;
        } catch {
          signed_url = null;
        }
      }
      return { ...r, signed_url };
    }),
  );
  return NextResponse.json({ contracts: enriched });
}
