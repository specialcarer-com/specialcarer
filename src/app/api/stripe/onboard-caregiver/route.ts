import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

/**
 * POST /api/stripe/onboard-caregiver
 *
 * Creates (or reuses) a Stripe Express Connect account for the signed-in
 * caregiver and returns a hosted onboarding link they should be redirected to.
 *
 * Body: { country?: "GB" | "US" }  (defaults to "GB")
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let country: "GB" | "US" = "GB";
  try {
    const body = (await req.json()) as { country?: "GB" | "US" };
    if (body?.country === "US" || body?.country === "GB") {
      country = body.country;
    }
  } catch {
    // empty body is fine, keep default
  }

  const admin = createAdminClient();

  // Look for an existing Connect account for this user
  const { data: existing } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
      },
      country,
      email: user.email ?? undefined,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: "individual",
      metadata: {
        specialcarer_user_id: user.id,
      },
    });
    accountId = account.id;

    await admin.from("caregiver_stripe_accounts").insert({
      user_id: user.id,
      stripe_account_id: account.id,
      country,
      default_currency: country === "GB" ? "gbp" : "usd",
    });
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://specialcarer.com";

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard/payouts?refresh=1`,
    return_url: `${origin}/dashboard/payouts?onboarded=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
