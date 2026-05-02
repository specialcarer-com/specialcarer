/**
 * uCheck adapter (UK background checks).
 *
 * Sandbox mode (when UCHECK_API_KEY is missing or starts with "stub_") returns
 * deterministic fake responses so the integration is testable end-to-end before
 * real API credentials arrive.
 *
 * Real uCheck API base URL + endpoints are configured by env:
 *   UCHECK_BASE_URL          (e.g. https://api.ucheck.co.uk/v1)
 *   UCHECK_API_KEY           (Bearer token)
 *   UCHECK_WEBHOOK_SECRET    (HMAC secret for inbound webhook verification)
 *
 * Once real credentials land, swap callRealUCheck() with the live request shape
 * uCheck specifies in their API docs — the public surface here stays identical.
 */

import crypto from "crypto";

export type UCheckCheckType =
  | "enhanced_dbs_barred"
  | "right_to_work"
  | "digital_id";

export type UCheckApplicantInput = {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  redirect_to: string;
};

export type UCheckApplicantResult = {
  vendor_applicant_id: string;
  invite_url: string;
};

export type UCheckCheckRequest = {
  vendor_applicant_id: string;
  check_type: UCheckCheckType;
};

export type UCheckCheckResult = {
  vendor_check_id: string;
  status: "invited" | "in_progress" | "submitted" | "pending_result" | "cleared";
};

export type UCheckWebhookPayload = {
  event_id: string;
  type: string;
  applicant_id: string;
  check_id?: string;
  check_type?: UCheckCheckType;
  result?: "cleared" | "consider" | "failed";
  outcome_summary?: string;
  issued_at?: string;
  expires_at?: string;
  raw: Record<string, unknown>;
};

const baseUrl = process.env.UCHECK_BASE_URL || "https://api.ucheck.co.uk/v1";
const apiKey = process.env.UCHECK_API_KEY || "";
const webhookSecret = process.env.UCHECK_WEBHOOK_SECRET || "";

export function isStubMode(): boolean {
  return !apiKey || apiKey.startsWith("stub_");
}

export function getWebhookSecret(): string {
  return webhookSecret;
}

/**
 * Verify uCheck webhook signature.
 * uCheck (per docs) sends an HMAC-SHA256 of the raw body using the shared
 * secret in an `X-UCheck-Signature` header. This is the standard pattern; if
 * uCheck returns a different header name during onboarding we'll adapt here.
 */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  if (!signature || !webhookSecret) return false;
  const computed = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  // Constant-time compare; tolerate "sha256=" prefix variants
  const provided = signature.replace(/^sha256=/, "").toLowerCase();
  if (provided.length !== computed.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(computed, "hex")
  );
}

async function callRealUCheck<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`uCheck API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * Create or fetch an applicant record at uCheck and get a hosted invite URL.
 * In stub mode we return deterministic IDs so the rest of the flow is testable.
 */
export async function createApplicant(
  input: UCheckApplicantInput
): Promise<UCheckApplicantResult> {
  if (isStubMode()) {
    const vendor_applicant_id = `stub_app_${input.user_id.slice(0, 8)}`;
    const invite_url = `https://app.ucheck.co.uk/sandbox/invite/${vendor_applicant_id}?redirect=${encodeURIComponent(
      input.redirect_to
    )}`;
    return { vendor_applicant_id, invite_url };
  }

  // Real API shape (placeholder — confirmed against uCheck docs at integration time)
  return callRealUCheck<UCheckApplicantResult>("/applicants", {
    method: "POST",
    body: JSON.stringify({
      external_id: input.user_id,
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      redirect_to: input.redirect_to,
    }),
  });
}

/**
 * Order a specific check on an existing applicant.
 */
export async function startCheck(
  req: UCheckCheckRequest
): Promise<UCheckCheckResult> {
  if (isStubMode()) {
    return {
      vendor_check_id: `stub_chk_${req.check_type}_${req.vendor_applicant_id.slice(-6)}`,
      status: "invited",
    };
  }
  return callRealUCheck<UCheckCheckResult>(
    `/applicants/${req.vendor_applicant_id}/checks`,
    {
      method: "POST",
      body: JSON.stringify({ check_type: req.check_type }),
    }
  );
}

/**
 * Cost catalogue (cents, GBP). Keep in sync with uCheck pricing once confirmed.
 * Used to write a vendor_costs row each time a check is started (platform absorbs).
 */
export const UCHECK_COST_CENTS_GBP: Record<UCheckCheckType, number> = {
  enhanced_dbs_barred: 6000, // ~£60 (statutory £49.50 + uCheck fee)
  right_to_work: 500,
  digital_id: 500,
};

export const UCHECK_REQUIRED_TYPES: UCheckCheckType[] = [
  "enhanced_dbs_barred",
  "right_to_work",
  "digital_id",
];
