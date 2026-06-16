import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar, BottomNav } from "../_components/ui";
import VerifyIdentityCard from "@/components/identity/VerifyIdentityCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Identity — SpecialCarers" };

/**
 * /m/identity — Identity verification surface (Veriff).
 *
 * The VerifyIdentityCard renders nothing while IDENTITY_VERIFICATION_ENABLED is
 * off (its data fetch returns 403), so this page is a safe always-mounted home
 * for the feature. The same card is also mounted on the family + carer home
 * dashboards; this dedicated route is the canonical deep-link target for the
 * Veriff callback URL.
 */
export default async function IdentityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/identity");

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Identity verification" back="/m/profile" />
      <div className="px-4 pt-4 space-y-4">
        <VerifyIdentityCard />
      </div>
      <BottomNav active="profile" />
    </main>
  );
}
