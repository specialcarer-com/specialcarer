import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateReferralCode } from "@/lib/referrals/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/referral — return the caller's referral code (lazy-creating
 * one on first hit), share URL, lifetime stats, and current credit balance.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const code = await getOrCreateReferralCode(
    admin,
    user.id,
    profile?.full_name ?? null,
  );

  // Stats: how many people have used my code; how many qualified.
  const claims = await admin
    .from("referral_claims")
    .select("status")
    .eq("referrer_id", user.id);

  const invited = claims.data?.length ?? 0;
  const qualified =
    claims.data?.filter((c) => c.status === "qualified").length ?? 0;

  const balance = await admin
    .from("v_user_credit_balance")
    .select("available_cents, lifetime_cents")
    .eq("user_id", user.id)
    .maybeSingle();

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://specialcarer.com";

  return NextResponse.json({
    code,
    share_url: `${origin}/r/${code}`,
    invited,
    qualified,
    available_cents: Number(balance.data?.available_cents ?? 0),
    lifetime_cents: Number(balance.data?.lifetime_cents ?? 0),
  });
}
