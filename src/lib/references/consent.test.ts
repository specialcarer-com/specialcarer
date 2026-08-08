import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { CANDIDATE_CONSENT_DECLARATION, normaliseNationalInsuranceNumber, UK_NI_RE, type ReferenceConsent } from "./consent";
import { generateConsentPdf } from "./generate-consent-pdf";

test("candidate consent accepts normalised valid UK NI numbers and rejects invalid numbers", () => {
  assert.equal(normaliseNationalInsuranceNumber("qq 12 34 56 c"), "QQ123456C");
  assert.equal(UK_NI_RE.test("QQ123456C"), true);
  assert.equal(UK_NI_RE.test("AA123456E"), false);
});

test("consent PDF contains candidate details and declaration", async () => {
  const consent: ReferenceConsent = { id: "7d5d1124-1a4c-4c85-98d7-6f91f10e9312", carer_id: "7d5d1124-1a4c-4c85-98d7-6f91f10e9312", full_name: "Aisha Khan", date_of_birth: "1992-03-12", national_insurance_number: "QQ123456C", signature_data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+Z4rDeAAAAABJRU5ErkJggg==", signed_at: "2026-08-08T12:00:00.000Z", signed_ip: "127.0.0.1", signed_ua: "test", pdf_storage_path: null, revoked_at: null, created_at: "2026-08-08T12:00:00.000Z" };
  const bytes = await generateConsentPdf(consent);
  const loaded = await PDFDocument.load(bytes);
  const text = Buffer.from(bytes).toString("latin1");
  assert.equal(loaded.getPageCount(), 1);
  assert.match(text, /Aisha Khan/);
  assert.match(text, /Candidate Disclosure Consent/);
  assert.match(CANDIDATE_CONSENT_DECLARATION("Aisha Khan"), /CQC Schedule 3/);
});
