import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: consent, error } = await supabase
    .from("carer_reference_consents")
    .select("pdf_storage_path, revoked_at, consent_pdf_status")
    .eq("carer_id", user.id)
    .eq("consent_pdf_status", "active")
    .is("revoked_at", null)
    .maybeSingle<{
      pdf_storage_path: string | null;
      revoked_at: string | null;
      consent_pdf_status: "active";
    }>();
  if (error || !consent?.pdf_storage_path) {
    return NextResponse.json(
      { error: "Consent PDF not found" },
      { status: 404 }
    );
  }
  const { data, error: signedError } = await createAdminClient()
    .storage.from("reference-consents")
    .createSignedUrl(consent.pdf_storage_path, 60);
  if (signedError || !data) {
    return NextResponse.json(
      { error: "Could not create PDF link" },
      { status: 500 }
    );
  }
  return NextResponse.redirect(data.signedUrl);
}
