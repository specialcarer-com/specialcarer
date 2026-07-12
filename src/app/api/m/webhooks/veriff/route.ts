import { NextResponse } from "next/server";
import { verifyVeriffSignature } from "@/lib/identity/webhook";
import { buildIdentityClient } from "@/lib/identity/adapter";
import { handleWebhook } from "@/lib/identity/identity-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/m/webhooks/veriff
 *
 * Single endpoint for BOTH Veriff webhook URLs (events + decisions). The
 * X-HMAC-SIGNATURE header is HMAC-SHA256 verified against VERIFF_SIGNATURE_KEY
 * over the RAW request body. On a valid signature the payload's status is
 * mapped and persisted onto the matching identity_verifications row.
 *
 *   - invalid signature                → 401
 *   - malformed / unknown event/session → 200 (log only, so Veriff stops
 *     retrying out-of-band deliveries)
 *   - recognised event/decision         → row updated, 200
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hmac-signature");

  const { valid, payload } = verifyVeriffSignature(raw, signature);

  return handleWebhook({
    valid,
    payload,
    client: buildIdentityClient(),
  });
}
