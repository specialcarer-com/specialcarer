import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTotpOrRecovery } from "@/lib/security/verify";
import { issueRecoveryCodes } from "@/lib/security/store";
import { check2faRateLimit } from "@/lib/security/rate-limit";
import type { VerifyResponse } from "../../verify/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/security/2fa/recovery-codes/regenerate
 * Body: { code }  — a current TOTP code (recovery codes NOT accepted here).
 *
 * Requires the authenticator (not a recovery code, since we're about to
 * invalidate the recovery batch). Invalidates the prior batch and returns a
 * fresh set of plaintext codes once. Auth: any signed-in user. Rate-limited.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!check2faRateLimit("regenerate", user.id)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code) {
    return NextResponse.json({ error: "A verification code is required." }, { status: 400 });
  }

  const result = await verifyTotpOrRecovery(supabase, user.id, code, {
    allowRecovery: false,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "That code didn't match." }, { status: 401 });
  }

  const recoveryCodes = await issueRecoveryCodes(user.id);
  const body: VerifyResponse = { recoveryCodes };
  return NextResponse.json(body);
}
