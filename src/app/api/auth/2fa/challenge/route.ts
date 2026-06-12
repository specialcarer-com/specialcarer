import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTotpOrRecovery } from "@/lib/security/verify";
import { check2faRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/challenge
 * Body: { code }  — TOTP (elevates the session to aal2) or a recovery code.
 *
 * Sign-in step-up: called from /sign-in/2fa after a successful password sign-in
 * when the user has an active TOTP factor. A valid TOTP elevates the session's
 * assurance level to aal2 (Supabase writes the elevated session cookie). A
 * recovery code is consumed on success — but recovery does NOT raise the session
 * to aal2 (it's a possession-bypass), so we accept it as a sign-in fallback only.
 *
 * Auth: a signed-in (aal1) user mid-challenge. Rate-limited 5/min.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!check2faRateLimit("challenge", user.id)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code) {
    return NextResponse.json({ error: "A verification code is required." }, { status: 400 });
  }

  const result = await verifyTotpOrRecovery(supabase, user.id, code, {
    allowRecovery: true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "That code didn't match." }, { status: 401 });
  }

  return NextResponse.json({ verified: true, method: result.method });
}
