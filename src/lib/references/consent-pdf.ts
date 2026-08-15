import { createAdminClient } from "@/lib/supabase/admin";
import type { ReferenceConsent } from "./consent";
import { generateConsentPdf } from "./generate-consent-pdf";

export function consentPdfErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Unknown PDF generation error";
  return message.slice(0, 1000);
}

/** Generate, upload and activate a consent PDF as one reusable operation. */
export async function generateAndStoreConsentPdf(
  consent: ReferenceConsent
): Promise<ReferenceConsent> {
  const bytes = await generateConsentPdf(consent);
  const filePath = `${consent.carer_id}/consent-${consent.id}.pdf`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("reference-consents")
    .upload(filePath, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: updated, error: updateError } = await admin
    .from("carer_reference_consents")
    .update({
      pdf_storage_path: filePath,
      consent_pdf_status: "active",
      consent_pdf_error: null,
    })
    .eq("id", consent.id)
    .select("*")
    .single<ReferenceConsent>();
  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Could not activate consent PDF");
  }
  return updated;
}

/** Keep the saved consent retriable when PDF creation or storage fails. */
export async function markConsentPdfFailed(
  consentId: string,
  error: unknown
): Promise<{ consent: ReferenceConsent | null; error: Error | null }> {
  const admin = createAdminClient();
  const { data, error: updateError } = await admin
    .from("carer_reference_consents")
    .update({
      consent_pdf_status: "failed",
      consent_pdf_error: consentPdfErrorMessage(error),
    })
    .eq("id", consentId)
    .select("*")
    .single<ReferenceConsent>();
  return {
    consent: data ?? null,
    error: updateError ? new Error(updateError.message) : null,
  };
}
