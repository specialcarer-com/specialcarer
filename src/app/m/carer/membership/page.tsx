import { TopBar, BottomNav } from "../../_components/ui";
import { getMyCarerMembership } from "@/lib/carer-membership/server";
import CarerMembershipClient from "./CarerMembershipClient";

/**
 * Carer Founder Membership hub.
 *
 * Three states (resolved from the carer_memberships row):
 *   1. No membership      → "Become a Founding Carer" hero + Start CTA
 *   2. Active             → status card + renewal date + "Manage in Stripe"
 *   3. Past due / canceled → explainer + re-subscribe CTA
 *
 * Checkout opens a Stripe-hosted Checkout Session (subscription mode) via
 * POST /api/billing/carer-checkout; the Stripe webhook reconciles entitlement
 * once payment confirms.
 */
export const dynamic = "force-dynamic";

export default async function CarerMembershipPage() {
  const membership = await getMyCarerMembership();

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Founder Membership" back="/m/profile" />
      <CarerMembershipClient membership={membership} />
      <BottomNav active="profile" />
    </main>
  );
}
