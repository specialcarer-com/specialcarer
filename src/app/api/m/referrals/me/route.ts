import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  REFERRAL_BONUS_CENTS_GBP,
  REFERRAL_BONUS_CENTS_USD,
  REFERRAL_QUALIFYING_BOOKINGS,
} from "@/lib/earnings/fees";

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "https://specialcarer.com"
  );
}

/**
 * GET /api/m/referrals/me
 * Returns the carer's referral code, share URL, list of inbound
 * referrals (carers they brought on board) with progress, and the
 * total bonus credited (not yet paid — we track only).
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
  const { data: prof } = await admin
    .from("caregiver_profiles")
    .select("referral_code, country")
    .eq("user_id", user.id)
    .maybeSingle<{ referral_code: string | null; country: string | null }>();

  let code = prof?.referral_code ?? null;
  if (!code) {
    // Lazy-mint if backfill hasn't run yet.
    code = `R${user.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`;
    await admin
      .from("caregiver_profiles")
      .update({ referral_code: code })
      .eq("user_id", user.id);
  }

  const { data: refRows } = await admin
    .from("referrals")
    .select(
      "id, referee_id, qualifying_bookings, payout_status, paid_out_at, created_at",
    )
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    referee_id: string;
    qualifying_bookings: number;
    payout_status: string;
    paid_out_at: string | null;
    created_at: string;
  };
  const rows = (refRows ?? []) as Row[];
  const bonusCents =
    prof?.country === "US"
      ? REFERRAL_BONUS_CENTS_USD
      : REFERRAL_BONUS_CENTS_GBP;
  const totalEarnedCents = rows
    .filter((r) => r.payout_status === "qualified" || r.payout_status === "paid")
    .reduce(() => bonusCents, 0);

  return NextResponse.json({
    code,
    share_url: `${siteUrl()}/become-a-caregiver?ref=${encodeURIComponent(code)}`,
    qualifying_bookings_required: REFERRAL_QUALIFYING_BOOKINGS,
    bonus_cents: bonusCents,
    bonus_currency: prof?.country === "US" ? "usd" : "gbp",
    total_earned_cents:
      rows.filter((r) => r.payout_status === "qualified" || r.payout_status === "paid")
        .length * bonusCents,
    referrals: rows.map((r) => ({
      id: r.id,
      qualifying_bookings: r.qualifying_bookings,
      payout_status: r.payout_status,
      paid_out_at: r.paid_out_at,
      created_at: r.created_at,
    })),
    // Indicates the cap on hand-rolled bonus accumulation; UI uses
    // it to render the X/5 progress bars.
    qualifying_bookings_cap: REFERRAL_QUALIFYING_BOOKINGS,
    _total_earned_cents_check: totalEarnedCents,
  });
}
