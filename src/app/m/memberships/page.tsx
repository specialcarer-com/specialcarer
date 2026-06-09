import { TopBar, BottomNav } from "../_components/ui";
import { getMyMembership } from "@/lib/memberships/server";
import MembershipsClient from "./MembershipsClient";

/**
 * Memberships hub.
 *
 * Two states:
 *   1. Active member  → show "Your membership" detail card + perks
 *   2. Non-member     → show plan cards with an active Subscribe CTA
 *
 * Backed by a real subscriptions table + Stripe products + webhook.
 * Admin-granted comps render the same as paid Stripe subs (with a "Comp"
 * badge so the user understands it's complimentary).
 *
 * App Review note: in-app checkout is live. A plan's Subscribe button opens a
 * Stripe-hosted Checkout Session (subscription mode) via
 * POST /api/memberships/checkout; the Stripe webhook reconciles entitlement
 * once payment confirms. On native iOS the checkout url is opened in the
 * system browser by the Capacitor/Expo shell rather than the in-app WebView
 * (see MembershipsClient.startCheckout).
 */

export const dynamic = "force-dynamic";

export default async function MembershipsPage() {
  const membership = await getMyMembership();

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Memberships" back="/m/profile" />
      <MembershipsClient membership={membership} />
      <BottomNav active="profile" />
    </main>
  );
}
