import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SummaryRow = {
  today_cents: number;
  week_cents: number;
  month_cents: number;
  year_cents: number;
  lifetime_cents: number;
  tips_today_cents: number;
  tips_week_cents: number;
  tips_month_cents: number;
  tips_year_cents: number;
  completed_bookings_this_week: number;
  last_payout_at: string | null;
  available_balance_cents: number;
  currency: string;
};

/**
 * GET /api/m/earnings/summary?currency=gbp|usd
 *
 * Pulls the dashboard summary + streak + Stripe Connect status in
 * a single round-trip the mobile dashboard renders against.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const currencyRaw = (url.searchParams.get("currency") ?? "").toLowerCase();
  // Default the currency from caregiver_profiles.country when not given.
  let currency: "gbp" | "usd" =
    currencyRaw === "usd" || currencyRaw === "gbp" ? currencyRaw : "gbp";
  const admin = createAdminClient();

  if (currencyRaw !== "gbp" && currencyRaw !== "usd") {
    const { data: prof } = await admin
      .from("caregiver_profiles")
      .select("country")
      .eq("user_id", user.id)
      .maybeSingle<{ country: string | null }>();
    currency = prof?.country === "US" ? "usd" : "gbp";
  }

  const [summaryRes, streakRes, stripeRes] = await Promise.all([
    admin.rpc("carer_earnings_summary", {
      p_carer: user.id,
      p_currency: currency,
    }),
    admin.rpc("carer_streak_weeks", { p_carer: user.id }),
    admin
      .from("caregiver_stripe_accounts")
      .select(
        "stripe_account_id, charges_enabled, payouts_enabled, details_submitted",
      )
      .eq("user_id", user.id)
      .maybeSingle<{
        stripe_account_id: string | null;
        charges_enabled: boolean | null;
        payouts_enabled: boolean | null;
        details_submitted: boolean | null;
      }>(),
  ]);

  const row =
    Array.isArray(summaryRes.data) && summaryRes.data.length > 0
      ? (summaryRes.data[0] as SummaryRow)
      : null;
  const summary: SummaryRow = row ?? {
    today_cents: 0,
    week_cents: 0,
    month_cents: 0,
    year_cents: 0,
    lifetime_cents: 0,
    tips_today_cents: 0,
    tips_week_cents: 0,
    tips_month_cents: 0,
    tips_year_cents: 0,
    completed_bookings_this_week: 0,
    last_payout_at: null,
    available_balance_cents: 0,
    currency,
  };

  return NextResponse.json({
    summary,
    streak_weeks:
      typeof streakRes.data === "number" ? streakRes.data : 0,
    stripe: {
      onboarded: !!stripeRes.data?.details_submitted,
      payouts_enabled: !!stripeRes.data?.payouts_enabled,
      has_account: !!stripeRes.data?.stripe_account_id,
    },
  });
}
