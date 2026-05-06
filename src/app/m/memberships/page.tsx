import { TopBar, BottomNav } from "../_components/ui";
import { getMyMembership } from "@/lib/memberships/server";
import MembershipsClient from "./MembershipsClient";

/**
 * Memberships hub.
 *
 * Two states:
 *   1. Active member  → show "Your membership" detail card + perks
 *   2. Non-member     → show Coming Soon teaser with plan strip
 *
 * Backed by a real subscriptions table + Stripe products + webhook.
 * Admin-granted comps render the same as paid Stripe subs (with a "Comp"
 * badge so the user understands it's complimentary).
 *
 * App Review note: nothing on this screen charges a card. Sign-up is not
 * yet available in-app — checkout will be added in a follow-up sprint.
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
