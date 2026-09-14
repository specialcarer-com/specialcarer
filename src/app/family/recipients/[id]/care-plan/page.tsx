/**
 * Read-only care-plan view for family members.
 *
 * RLS-gated: the family_view flag guards the route (redirects to
 * /family with a coming-soon banner when off). RLS on
 * `care_plan_latest_for_recipient` (via the underlying tables) is what
 * decides which recipients this caller can actually see. This route
 * never mutates data and never issues a PDF download (privacy).
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isFamilyCarePlanViewEnabled } from "@/lib/care-plan/flag";
import { getFamilyCarePlanForRecipient } from "@/lib/care-plan/family-view";
import CarePlanView from "./CarePlanView";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Care plan — SpecialCarer",
  robots: { index: false, follow: false },
};

export default async function FamilyRecipientCarePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Off-state: redirect to the family hub rather than 404. Users landing
  // from an email link get a soft page instead of a hard error.
  if (!isFamilyCarePlanViewEnabled()) {
    redirect("/family");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/family/recipients/${id}/care-plan`);

  const view = await getFamilyCarePlanForRecipient(id);
  if (!view) notFound();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Family view</p>
            <h1 className="text-xl font-semibold text-slate-900 mt-0.5">
              {view.recipient.display_name}&apos;s care plan
            </h1>
          </div>
          <Link
            href="/family"
            className="text-sm text-slate-600 hover:text-slate-900 underline"
          >
            ← Back to family
          </Link>
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-6 py-8">
        <CarePlanView view={view} />
      </section>
    </main>
  );
}
