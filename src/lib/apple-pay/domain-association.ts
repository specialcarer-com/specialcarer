/**
 * Apple Pay domain-association file payload helper.
 *
 * Apple Pay on the Web requires the merchant's domain to host a static
 * verification file at:
 *
 *   https://<domain>/.well-known/apple-developer-merchantid-domain-association
 *
 * The exact payload is issued by Stripe when you register a domain in the
 * Stripe Dashboard → Settings → Payments → Apple Pay → "Add a new domain"
 * flow. We don't commit that payload to the repo because:
 *
 * 1. It's tied to the live Stripe account — committing it leaks a
 *    production-scoped string into git history.
 * 2. Stripe can rotate / re-issue the file; pinning it in source means a
 *    redeploy on every rotation.
 * 3. We may need different payloads for staging vs production accounts.
 *
 * Instead the payload lives in a Vercel env var (APPLE_PAY_DOMAIN_ASSOCIATION).
 * This module owns the env lookup so the API route stays a thin shim.
 */

/**
 * Env var that holds the raw Apple Pay domain-association file body.
 *
 * Set this in Vercel (and locally in .env.local for dev) to the verbatim
 * contents Stripe provides when you add a domain in the Apple Pay
 * settings. No quoting, no JSON-encoding — paste exactly as downloaded.
 */
export const APPLE_PAY_DOMAIN_ASSOCIATION_ENV =
  "APPLE_PAY_DOMAIN_ASSOCIATION";

export type DomainAssociationResult =
  | { ok: true; body: string }
  | { ok: false; reason: "missing-env" };

/**
 * Resolve the file body from the environment.
 *
 * Returns `{ ok: false, reason: "missing-env" }` if the env var is unset
 * or empty so the caller can return a 404 rather than serving an empty
 * file (which would confuse Apple's verifier).
 */
export function getDomainAssociation(
  env: Record<string, string | undefined> = process.env,
): DomainAssociationResult {
  const raw = env[APPLE_PAY_DOMAIN_ASSOCIATION_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, reason: "missing-env" };
  }
  return { ok: true, body: raw };
}
