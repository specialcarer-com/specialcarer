import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { issueRecoveryCodes } from "@/lib/security/store";
import { check2faRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export type VerifyResponse = {
  /** Plaintext recovery codes — returned ONCE, never retrievable again. */
  recoveryCodes: string[];
};

/**
 * POST /api/m/security/2fa/verify
 * Body: { factorId, code }
 *
 * Completes enrolment: challenges the freshly-enrolled factor and verifies the
 * 6-digit TOTP. On success the factor becomes active (aal2) and we mint the
 * user's 10 recovery codes, returning the plaintext exactly once.
 *
 * Auth: any signed-in user. Rate-limited 5/min.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!check2faRateLimit("enrol-verify", user.id)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const { factorId, code } = (await req.json().catch(() => ({}))) as {
    factorId?: string;
    code?: string;
  };
  if (!factorId || !code) {
    return NextResponse.json({ error: "Missing factorId or code." }, { status: 400 });
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error) {
    return NextResponse.json({ error: "That code didn't match. Try again." }, { status: 400 });
  }

  const recoveryCodes = await issueRecoveryCodes(user.id);
  const body: VerifyResponse = { recoveryCodes };
  return NextResponse.json(body);
}
