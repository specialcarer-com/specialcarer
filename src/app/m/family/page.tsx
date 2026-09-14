import { TopBar, BottomNav } from "../_components/ui";
import { getMyFamilyOverview } from "@/lib/family/server";
import FamilyClient from "./FamilyClient";
import {
  isFamilyCarePlanViewEnabled,
  isReg9ReviewCadenceEnabled,
} from "@/lib/care-plan/flag";
import { listFamilyRecipientsForCaller } from "@/lib/care-plan/family-view";

/**
 * Family Sharing hub.
 *
 * The primary user (booker / payer) sees their members + pending invites and
 * can invite by email. Members of someone else's family see a read-only view.
 */
export const dynamic = "force-dynamic";

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const params = await searchParams;
  const overview = await getMyFamilyOverview();
  const familyViewFlag = isFamilyCarePlanViewEnabled();
  const reviewsFlag = isReg9ReviewCadenceEnabled();
  // Only pay the recipient-fetch cost when the flag is on (off-state
  // guarantee — see /lib/care-plan/flag.ts).
  const recipients = familyViewFlag
    ? await listFamilyRecipientsForCaller(overview?.family.id ?? null)
    : [];

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Family sharing" back="/m/profile" />
      <FamilyClient
        overview={overview}
        welcome={params.welcome === "1"}
        recipients={recipients}
        familyViewFlag={familyViewFlag}
        reviewsFlag={reviewsFlag}
      />
      <BottomNav active="profile" />
    </main>
  );
}
