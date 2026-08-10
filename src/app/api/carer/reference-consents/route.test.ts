import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReferenceConsent } from "@/lib/references/consent";
import { createConsentPostHandler } from "./route";

const savedConsent: ReferenceConsent = {
  id: "consent-id",
  carer_id: "carer-id",
  full_name: "Aisha Khan",
  date_of_birth: "1992-03-12",
  national_insurance_number: "AB123456C",
  signature_data_url: "data:image/png;base64,test",
  signed_at: "2026-08-11T00:00:00.000Z",
  signed_ip: null,
  signed_ua: null,
  pdf_storage_path: null,
  consent_pdf_status: "pending",
  consent_pdf_error: null,
  revoked_at: null,
  created_at: "2026-08-11T00:00:00.000Z",
};

test("consent creation fails closed and reports a failed PDF status", async () => {
  const failedConsent: ReferenceConsent = {
    ...savedConsent,
    consent_pdf_status: "failed",
    consent_pdf_error: "Storage upload failed",
  };
  const upsert = {
    select() {
      return upsert;
    },
    async single() {
      return { data: savedConsent, error: null };
    },
  };
  const handler = createConsentPostHandler({
    getSession: (async () =>
      ({
        user: { id: "carer-id" },
        supabase: {
          from() {
            return {
              upsert() {
                return upsert;
              },
            };
          },
        },
      } as never)) as never,
    generatePdf: async () => {
      throw new Error("Storage upload failed");
    },
    markFailed: async () => ({ consent: failedConsent, error: null }),
  });

  const response = await handler(
    new Request("https://www.specialcarer.com/api/carer/reference-consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: "Aisha Khan",
        date_of_birth: "1992-03-12",
        national_insurance_number: "AB123456C",
        signature_data_url: "data:image/png;base64,test",
      }),
    })
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Unable to generate consent PDF",
    consent: failedConsent,
  });
});
