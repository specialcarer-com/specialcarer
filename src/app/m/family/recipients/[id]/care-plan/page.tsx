/**
 * Mobile family care-plan viewer.
 *
 * Same content as the web `/family/recipients/[id]/care-plan` route
 * wrapped in the mobile TopBar / BottomNav shell.
 */
import { notFound, redirect } from "next/navigation";
import { TopBar, BottomNav } from "../../../../_components/ui";
import { createClient } from "@/lib/supabase/server";
import { isFamilyCarePlanViewEnabled } from "@/lib/care-plan/flag";
import { getFamilyCarePlanForRecipient } from "@/lib/care-plan/family-view";
import CarePlanView from "@/app/family/recipients/[id]/care-plan/CarePlanView";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Care plan — SpecialCarer",
  robots: { index: false, follow: false },
};

export default async function MobileRecipientCarePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isFamilyCarePlanViewEnabled()) {
    redirect("/m/family");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/m/family/recipients/${id}/care-plan`);

  const view = await getFamilyCarePlanForRecipient(id);
  if (!view) notFound();

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar
        title={`${view.recipient.display_name}'s care plan`}
        back="/m/family"
      />
      <section className="px-4 py-5">
        <CarePlanView view={view} />
      </section>
      <BottomNav active="profile" />
    </main>
  );
}
