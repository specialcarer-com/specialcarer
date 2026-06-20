import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  handleCarerCheckout,
  type CarerCheckoutStripe,
  type CarerCheckoutSupabase,
} from "@/lib/carer-membership/checkout-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/carer-checkout
 *
 * Opens a Stripe subscription Checkout Session for the £4.99/mo carer founder
 * membership and returns its hosted url. Requires an authenticated user whose
 * profiles.role = 'carer'. The webhook (checkout.session.completed +
 * customer.subscription.*) reconciles the carer_memberships row once Stripe
 * confirms payment.
 *
 * Returns: { url } 200 | { error } 401/403/400/429/500
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 }
    );
  }

  // 5 checkout starts / minute / carer — billing endpoint, keep it tight.
  if (!rateLimit(`carer-checkout:${user.id}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = createAdminClient();

  // Only carers may take the founder membership.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json(
      { ok: false, error: "profile_lookup_failed" },
      { status: 500 }
    );
  }
  if (profile?.role !== "carer") {
    return NextResponse.json(
      { error: "Only carers can take the founder membership." },
      { status: 403 }
    );
  }

  // Guard against creating a second subscription for a carer who already has an
  // active/trialing (non-cancelled) founder membership. The route is directly
  // POST-able, so this check belongs here, before we open a Checkout Session.
  const { data: membership, error: membershipError } = await admin
    .from("carer_memberships")
    .select("status")
    .eq("carer_user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json(
      { ok: false, error: "membership_lookup_failed" },
      { status: 500 }
    );
  }
  if (membership?.status === "active" || membership?.status === "trialing") {
    return NextResponse.json(
      {
        error: "Founder membership is already active.",
        manage_url: "/m/carer/membership",
      },
      { status: 409 }
    );
  }

  const result = await handleCarerCheckout({
    user: { id: user.id, email: user.email ?? null },
    supabase: admin as unknown as CarerCheckoutSupabase,
    stripe: stripe as unknown as CarerCheckoutStripe,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  });

  return NextResponse.json(result.body, { status: result.status });
}
