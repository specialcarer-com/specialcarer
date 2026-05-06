import { TopBar, BottomNav } from "../_components/ui";
import { getMyFamilyOverview } from "@/lib/family/server";
import FamilyClient from "./FamilyClient";

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

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Family sharing" back="/m/profile" />
      <FamilyClient overview={overview} welcome={params.welcome === "1"} />
      <BottomNav active="profile" />
    </main>
  );
}
