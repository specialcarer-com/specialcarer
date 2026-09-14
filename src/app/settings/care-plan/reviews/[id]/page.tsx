/**
 * /settings/care-plan/reviews/[id] — seeker "start review" form.
 * Wraps the interactive form below; server component handles the RLS
 * fetch and off-state redirect.
 */
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isReg9ReviewCadenceEnabled } from "@/lib/care-plan/flag";
import { getReviewForCaller } from "@/lib/care-plan/reviews-server";
import StartReviewForm from "./StartReviewForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Start review — SpecialCarer",
  robots: { index: false, follow: false },
};

export default async function StartReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isReg9ReviewCadenceEnabled()) redirect("/settings/care-plan/reviews");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/settings/care-plan/reviews/${id}`);

  const review = await getReviewForCaller(id);
  if (!review) notFound();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-5">
          <p className="text-xs text-slate-500">Care-plan reviews</p>
          <h1 className="text-xl font-semibold text-slate-900 mt-0.5">
            Review scheduled {review.scheduled_for}
          </h1>
        </div>
      </header>
      <section className="max-w-2xl mx-auto px-6 py-8">
        <StartReviewForm review={review} />
      </section>
    </main>
  );
}
