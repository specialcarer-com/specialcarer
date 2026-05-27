import { NextResponse } from "next/server";
import { getDomainAssociation } from "@/lib/apple-pay/domain-association";

/**
 * GET /.well-known/apple-developer-merchantid-domain-association
 *
 * Apple Pay on the Web domain verification endpoint. Apple's verifier
 * (hit by Stripe when you register a domain in the Apple Pay dashboard)
 * downloads this exact path and expects to receive the verbatim payload
 * Stripe issued for the merchant ID.
 *
 * The payload lives in the APPLE_PAY_DOMAIN_ASSOCIATION env var — see
 * src/lib/apple-pay/domain-association.ts for rationale.
 *
 * Response shape:
 *   200 text/plain — the payload, byte-exact, no trailing newline added
 *   404 text/plain — env var unset (so verifier reports a clean "missing
 *                    file" rather than serving an empty body)
 *
 * Must be a dynamic route (the env var can change without a redeploy
 * pushing a new bundle), and we explicitly forbid caching on
 * intermediaries because Apple's verifier needs the live payload.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const result = getDomainAssociation();
  if (!result.ok) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Apple's verifier doesn't honour cache headers, but be explicit
      // for any intermediary (Vercel edge cache, corporate proxies) so
      // a stale payload never sticks around if we rotate the env var.
      "cache-control": "no-store, max-age=0",
    },
  });
}
