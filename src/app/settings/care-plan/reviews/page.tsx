/**
 * /settings/care-plan/reviews — seeker view of upcoming and overdue
 * Reg-9 care-plan reviews for their bookings.
 *
 * Flag off → empty-state card. No data fetched.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isReg9ReviewCadenceEnabled } from "@/lib/care-plan/flag";
import { listReviewsForCaller } from "@/lib/care-plan/reviews-server";
import { reviewStatusBadge } from "@/lib/care-plan/reviews";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Care-plan reviews — SpecialCarer",
};

export default async function CarePlanReviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/settings/care-plan/reviews");

  const enabled = isReg9ReviewCadenceEnabled();
  const reviews = enabled ? await listReviewsForCaller() : [];
  const now = new Date();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <p className="text-xs text-slate-500">Settings</p>
          <h1 className="text-xl font-semibold text-slate-900 mt-0.5">
            Care-plan reviews
          </h1>
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-6 py-8">
        {!enabled ? (
          <EmptyState />
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-600">
            No upcoming or overdue reviews for your care plans. New reviews
            appear automatically every 6 months.
          </div>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => {
              const badge = reviewStatusBadge(r, now);
              return (
                <li
                  key={r.id}
                  className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">
                      Review scheduled {r.scheduled_for}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Cadence: every {r.cadence_months} months
                    </p>
                    <span
                      className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeToneClass(
                        badge.tone,
                      )}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <Link
                    href={`/settings/care-plan/reviews/${r.id}`}
                    className="self-center text-sm font-semibold text-slate-900 underline hover:no-underline"
                  >
                    Start review →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-medium text-slate-900">
        Care-plan reviews are on their way.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Once enabled, we&apos;ll schedule a Reg-9 review every 6 months and
        remind you 14 days and 1 day before it&apos;s due.
      </p>
    </div>
  );
}

function badgeToneClass(tone: string): string {
  switch (tone) {
    case "danger":
      return "bg-rose-100 text-rose-800";
    case "warn":
      return "bg-amber-100 text-amber-800";
    case "info":
      return "bg-sky-100 text-sky-800";
    case "success":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
