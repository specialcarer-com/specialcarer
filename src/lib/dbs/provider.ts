/**
 * DBS provider abstraction — Update Service path.
 *
 * The Update Service (https://www.gov.uk/dbs-update-service) lets a carer
 * keep an existing Enhanced DBS certificate "live" with an annual £16
 * subscription. With consent, the platform can verify status online at
 * https://secure.crbonline.gov.uk/enquiry/enquirySearch.do — saving the
 * £40-60 cost of a fresh Checkr DBS.
 *
 * Provider selection at runtime: env var `DBS_UPDATE_SERVICE_PROVIDER`
 *   - 'checkr'  — call Checkr's Update Service verification endpoint
 *   - 'manual'  — queue a verification request, admin verifies on gov.uk
 *
 * Default is 'manual'. Checkr's UK product (https://checkr.com/customers/uk
 * + docs.checkr.com) supports fresh Enhanced DBS but does not document a
 * public Update Service API as of 2026-05; the 'checkr' branch is wired
 * for the day they expose one.
 */

export type Workforce = "adult" | "child" | "both";

export type VerifyUpdateServiceInput = {
  carerLegalName: string;
  dateOfBirth: string; // ISO date
  certificateNumber: string;
  subscriptionId: string;
  workforceType: Workforce;
};

export type UpdateServiceStatus = "current" | "changed";

export type UpdateServiceFailureReason =
  | "no_subscription"
  | "wrong_workforce"
  | "expired"
  | "consent_missing"
  | "provider_error"
  | "manual_pending";

export type UpdateServiceCheckResult =
  | { ok: true; status: UpdateServiceStatus; raw: unknown; checkedAt: Date }
  | { ok: false; reason: UpdateServiceFailureReason; raw: unknown };

export type InitiateFreshDbsArgs = {
  carerId: string;
  workforceType: Workforce | string;
};

export interface DbsProvider {
  name: string;
  verifyUpdateService(
    args: VerifyUpdateServiceInput
  ): Promise<UpdateServiceCheckResult>;
  initiateFreshDbs(
    args: InitiateFreshDbsArgs
  ): Promise<{ providerCheckId: string }>;
}

import { checkrUpdateServiceProvider } from "./providers/checkr-update-service";
import { manualAdminProvider } from "./providers/manual-admin";

/**
 * Pick a provider based on env. Defaults to manual.
 */
export function getDbsProvider(): DbsProvider {
  const choice = (process.env.DBS_UPDATE_SERVICE_PROVIDER ?? "manual").toLowerCase();
  if (choice === "checkr") return checkrUpdateServiceProvider;
  return manualAdminProvider;
}

/**
 * Compute the next 12-month re-check timestamp from a base instant.
 * Exposed for testing.
 */
export function computeNextUsCheckDueAt(from: Date = new Date()): Date {
  const next = new Date(from.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

/**
 * Basic shape validation for an Update Service form payload.
 * Returns a list of error messages; empty list = valid.
 */
export function validateUpdateServiceInput(
  input: Partial<VerifyUpdateServiceInput>
): string[] {
  const errors: string[] = [];
  if (!input.carerLegalName || input.carerLegalName.trim().length < 2) {
    errors.push("Legal name is required.");
  }
  if (!input.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) {
    errors.push("Date of birth must be YYYY-MM-DD.");
  }
  if (!input.certificateNumber || !/^\d{12}$/.test(input.certificateNumber)) {
    errors.push("DBS certificate number must be 12 digits.");
  }
  if (!input.subscriptionId || !/^\d{12}$/.test(input.subscriptionId)) {
    errors.push("Update Service subscription number must be 12 digits.");
  }
  if (
    !input.workforceType ||
    !["adult", "child", "both"].includes(input.workforceType)
  ) {
    errors.push("Workforce type must be adult, child, or both.");
  }
  return errors;
}
