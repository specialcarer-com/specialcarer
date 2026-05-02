/**
 * Checkr adapter (US background checks).
 *
 * Stub mode (when CHECKR_API_KEY is missing or starts with "stub_") returns
 * deterministic fake responses so the integration is testable end-to-end before
 * real API credentials arrive.
 *
 * Env:
 *   CHECKR_BASE_URL          (default https://api.checkr.com/v1)
 *   CHECKR_API_KEY           (Basic auth — Checkr uses HTTP Basic with key as username, blank password)
 *   CHECKR_PACKAGE_SLUG      (default 'pro_criminal_and_mvr_and_healthcare_sanctions')
 *   CHECKR_WEBHOOK_SECRET    (HMAC-SHA256 secret for webhook verification)
 *
 * Docs: https://docs.checkr.com/
 */

import crypto from "crypto";

export type CheckrCheckType =
  | "us_criminal"
  | "us_mvr"
  | "us_healthcare_sanctions";

export type CheckrCandidateInput = {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  redirect_to: string;
};

export type CheckrCandidateResult = {
  vendor_candidate_id: string;
  invitation_url: string;
};

export type CheckrInvitationResult = {
  vendor_invitation_id: string;
  invitation_url: string;
  package: string;
};

const baseUrl = process.env.CHECKR_BASE_URL || "https://api.checkr.com/v1";
const apiKey = process.env.CHECKR_API_KEY || "";
const packageSlug =
  process.env.CHECKR_PACKAGE_SLUG ||
  "pro_criminal_and_mvr_and_healthcare_sanctions";
const webhookSecret = process.env.CHECKR_WEBHOOK_SECRET || "";

export function isStubMode(): boolean {
  return !apiKey || apiKey.startsWith("stub_");
}

export function getPackageSlug(): string {
  return packageSlug;
}

/**
 * Verify a Checkr webhook signature.
 * Checkr signs with HMAC-SHA256 and sends the signature in `X-Checkr-Signature`.
 */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  if (!signature || !webhookSecret) return false;
  const computed = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const provided = signature.replace(/^sha256=/, "").toLowerCase();
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(computed, "hex")
  );
}

async function callRealCheckr<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  // Checkr uses HTTP Basic auth with API key as username, blank password
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Checkr API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * Create a candidate (Checkr's term for an applicant) and a hosted invitation.
 * Workflow: POST /candidates → POST /invitations { candidate_id, package }.
 */
export async function createCandidateAndInvitation(
  input: CheckrCandidateInput
): Promise<{
  vendor_candidate_id: string;
  vendor_invitation_id: string;
  invitation_url: string;
  package: string;
}> {
  if (isStubMode()) {
    const candidateId = `stub_cnd_${input.user_id.slice(0, 8)}`;
    const invitationId = `stub_inv_${input.user_id.slice(0, 8)}`;
    return {
      vendor_candidate_id: candidateId,
      vendor_invitation_id: invitationId,
      invitation_url: `https://apply.checkr.com/sandbox/${invitationId}?redirect=${encodeURIComponent(
        input.redirect_to
      )}`,
      package: packageSlug,
    };
  }

  type Candidate = { id: string };
  const candidate = await callRealCheckr<Candidate>("/candidates", {
    method: "POST",
    body: JSON.stringify({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      phone: input.phone,
      // Required minimums; Checkr collects DOB/SSN/address via hosted flow
      no_middle_name: true,
      work_locations: [{ country: "US" }],
      custom_id: input.user_id,
    }),
  });

  type Invitation = { id: string; invitation_url: string; package: string };
  const invitation = await callRealCheckr<Invitation>("/invitations", {
    method: "POST",
    body: JSON.stringify({
      candidate_id: candidate.id,
      package: packageSlug,
      tags: ["specialcarer"],
    }),
  });

  return {
    vendor_candidate_id: candidate.id,
    vendor_invitation_id: invitation.id,
    invitation_url: invitation.invitation_url,
    package: invitation.package,
  };
}

/**
 * Cost catalogue (cents, USD). Approximate Checkr Marketplace pricing — confirm
 * during onboarding call. Used for vendor_costs accounting (platform absorbs).
 *
 * Note: Checkr bundles map to multiple internal "screenings". We track them as
 * one combined `us_criminal` row + a separate `us_healthcare_sanctions` row.
 * MVR is optional (only if caregiver drives) so it's tracked separately.
 */
export const CHECKR_COST_CENTS_USD: Record<CheckrCheckType, number> = {
  us_criminal: 3500, // ~$35 — Pro Criminal + SSN trace + Sex offender registry
  us_healthcare_sanctions: 500, // ~$5 — OIG/SAM list scrubs
  us_mvr: 1500, // ~$15 — only if MVR added
};

/**
 * Required US bundle for caregivers (excludes MVR — that's optional).
 */
export const CHECKR_REQUIRED_TYPES: CheckrCheckType[] = [
  "us_criminal",
  "us_healthcare_sanctions",
];
