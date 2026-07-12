import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/billing/carer-portal
 *
 * Opens a Stripe Billing Portal session for the signed-in carer's customer so
 * they can manage / cancel the founder membership, and returns { url }.
 * The customer id is read server-side from the carer_memberships row (written
 * at checkout / by the webhook).
 *
 * Returns: { url } 200 | { error } 401/404/429/500
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

  if (!rateLimit(`carer-portal:${user.id}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!siteUrl) {
    return NextResponse.json(
      { error: "Site URL is not configured" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("carer_memberships")
    .select("stripe_customer_id")
    .eq("carer_user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json(
      { error: "Could not load billing account." },
      { status: 500 }
    );
  }

  const customerId = membership?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account found for this carer." },
      { status: 404 }
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/m/carer/membership`,
  });

  return NextResponse.json({ url: session.url });
}
