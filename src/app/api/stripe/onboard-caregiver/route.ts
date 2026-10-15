import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { US_REGION_ENABLED } from "@/lib/region";
import { buildCarerAccountPrefill } from "@/lib/stripe/carer-account-profile";

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

  // US launch is on hold: the UI no longer offers a country, so refuse it here
  // too rather than letting a direct POST create a US Connect account.
  if (country === "US" && !US_REGION_ENABLED) {
    return NextResponse.json(
      { error: "Carer payouts are only available in the United Kingdom for now." },
      { status: 400 },
    );
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
    // Pre-fill what we already know so Stripe's hosted form does not ask the
    // carer for an industry, business description or name again.
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null }>();
    const prefill = buildCarerAccountPrefill({
      fullName: profile?.full_name,
      email: user.email,
    });

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
      ...prefill,
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
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.specialcarer.com";

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/dashboard/payouts?refresh=1`,
    return_url: `${origin}/dashboard/payouts?onboarded=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
