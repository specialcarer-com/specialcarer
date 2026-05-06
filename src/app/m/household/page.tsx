import { TopBar, BottomNav } from "../_components/ui";
import { listMyRecipients } from "@/lib/recipients/server";
import HouseholdClient from "./HouseholdClient";

export const dynamic = "force-dynamic";

export default async function HouseholdPage() {
  const recipients = await listMyRecipients();
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="My household" back="/m/profile" />
      <HouseholdClient initial={recipients} />
      <BottomNav active="profile" />
    </main>
  );
}
