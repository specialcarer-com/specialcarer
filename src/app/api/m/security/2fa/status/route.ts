import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRecoveryCodeStatus } from "@/lib/security/store";

export const dynamic = "force-dynamic";

export type TwoFactorStatus = {
  enabled: boolean;
  recoveryCodesRemaining: number;
};

/**
 * GET /api/m/security/2fa/status
 *
 * Drives the /m/profile/security screen: whether the caller has an active TOTP
 * factor, and how many unused recovery codes remain.
 * Auth: any signed-in user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enabled = Boolean(factors?.totp?.some((f) => f.status === "verified"));
  const { remaining } = enabled
    ? await getRecoveryCodeStatus(user.id)
    : { remaining: 0 };

  const body: TwoFactorStatus = {
    enabled,
    recoveryCodesRemaining: remaining,
  };
  return NextResponse.json(body);
}
