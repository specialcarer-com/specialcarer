import { TopBar, BottomNav } from "../../_components/ui";
import ExpensesClient from "./ExpensesClient";

/**
 * HSA/FSA expenses (gap 33).
 *
 * US-only seeker tool to tag eligible care payments and export an annual
 * summary for their plan administrator. The client fetches the summary and
 * shows a US-only notice when the feature is disabled for this account.
 */
export const dynamic = "force-dynamic";

export default function ExpensesPage() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="HSA / FSA expenses" back="/m/profile" />
      <ExpensesClient />
      <BottomNav active="profile" />
    </main>
  );
}
