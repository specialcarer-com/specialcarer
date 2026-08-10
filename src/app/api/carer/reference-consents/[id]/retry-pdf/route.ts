import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  consentPdfErrorMessage,
  generateAndStoreConsentPdf,
  markConsentPdfFailed,
} from "@/lib/references/consent-pdf";
import type { ReferenceConsent } from "@/lib/references/consent";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: consent, error: lookupError } = await supabase
    .from("carer_reference_consents")
    .select("*")
    .eq("id", id)
    .eq("carer_id", user.id)
    .maybeSingle<ReferenceConsent>();
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!consent) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (consent.consent_pdf_status !== "failed") {
    return NextResponse.json(
      { error: "Consent PDF generation can only be retried after a failure" },
      { status: 400 }
    );
  }

  const { data: pending, error: claimError } = await supabase
    .from("carer_reference_consents")
    .update({
      consent_pdf_status: "pending",
      consent_pdf_error: null,
    })
    .eq("id", consent.id)
    .eq("carer_id", user.id)
    .eq("consent_pdf_status", "failed")
    .select("*")
    .maybeSingle<ReferenceConsent>();
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!pending) {
    return NextResponse.json(
      { error: "Consent PDF generation can only be retried after a failure" },
      { status: 400 }
    );
  }

  try {
    const updated = await generateAndStoreConsentPdf(pending);
    return NextResponse.json({ consent: updated });
  } catch (generationError) {
    const failure = await markConsentPdfFailed(pending.id, generationError);
    if (failure.error) {
      console.error(
        "[reference-consents] could not record retry failure",
        failure.error
      );
    }
    console.error(
      "[reference-consents] PDF generation retry failed",
      generationError
    );
    return NextResponse.json(
      {
        error: "Unable to generate consent PDF",
        consent: failure.consent ?? {
          ...pending,
          consent_pdf_status: "failed" as const,
          consent_pdf_error: consentPdfErrorMessage(generationError),
        },
      },
      { status: 500 }
    );
  }
}
