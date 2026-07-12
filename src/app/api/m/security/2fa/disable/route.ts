import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyTotpOrRecovery } from "@/lib/security/verify";
import { clearRecoveryCodes } from "@/lib/security/store";
import { check2faRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/security/2fa/disable
 * Body: { code }  — a current TOTP code OR a recovery code.
 *
 * Requires fresh proof of possession, then unenrols ALL of the user's TOTP
 * factors and wipes their recovery codes. Auth: any signed-in user.
 * Rate-limited 5/min.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!check2faRateLimit("disable", user.id)) {
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

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.totp ?? []) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  await clearRecoveryCodes(user.id);

  return NextResponse.json({ disabled: true });
}
