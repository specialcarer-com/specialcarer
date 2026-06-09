import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import {
  handleMembershipCheckout,
  type CheckoutStripe,
  type CheckoutSupabase,
} from "@/lib/memberships/checkout-handler";
import type { MembershipInterval } from "@/lib/memberships/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/memberships/checkout
 *
 * Opens a Stripe subscription Checkout Session for the signed-in user and
 * returns its hosted url. The webhook (customer.subscription.* +
 * checkout.session.completed) reconciles the subscriptions table once Stripe
 * confirms payment.
 *
 * Body: { plan_slug: "lite" | "plus" | "premium", interval?: "month" | "year" }
 * Returns: { url } 200 | { error } 401/404/400/500
 *
 * Customer find-or-create + the subscriptions read/write run through the
 * service-role admin client because RLS only grants users SELECT on their own
 * row — Stripe linkage writes are server-only.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { plan_slug?: unknown; interval?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty / malformed body falls through to the plan validation below
  }

  const interval: MembershipInterval =
    body.interval === "year" ? "year" : "month";

  const admin = createAdminClient();

  const result = await handleMembershipCheckout({
    user: { id: user.id, email: user.email ?? null },
    planSlug: body.plan_slug,
    interval,
    supabase: admin as unknown as CheckoutSupabase,
    stripe: stripe as unknown as CheckoutStripe,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  });

  return NextResponse.json(result.body, { status: result.status });
}
