/**
 * Web mirror of `/m/family` — includes the per-recipient care-plan card
 * grid when the family care-plan viewer flag is on.
 *
 * Server component. All reads go through the caller's user-scoped
 * client so RLS on `families`, `family_members`, `household_recipients`,
 * `care_plans`, and `care_plan_reviews` naturally scopes visibility.
 *
 * Off-state guarantee (flag off):
 *   - The recipient grid renders a "coming soon" card.
 *   - No care-plan / review data is fetched (early return before those
 *     helpers are called). Unit-tested in family/page.test.ts.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyFamilyOverview } from "@/lib/family/server";
import {
  isFamilyCarePlanViewEnabled,
  isReg9ReviewCadenceEnabled,
} from "@/lib/care-plan/flag";
import {
  listFamilyRecipientsForCaller,
  type FamilyRecipientTile,
} from "@/lib/care-plan/family-view";
import { reviewStatusBadge } from "@/lib/care-plan/reviews";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Family — SpecialCarer",
};

export default async function FamilyWebPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/family");

  const familyViewOn = isFamilyCarePlanViewEnabled();
  const reviewsOn = isReg9ReviewCadenceEnabled();

  const overview = await getMyFamilyOverview();
  const familyId = overview?.family.id ?? null;

  // Off-state: never hit the recipient / care-plan / review paths.
  const recipients: FamilyRecipientTile[] = familyViewOn
    ? await listFamilyRecipientsForCaller(familyId)
    : [];

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">
            Family sharing
          </h1>
          <Link
            href="/m/family"
            className="text-sm text-slate-600 hover:text-slate-900 underline"
          >
            Mobile version
          </Link>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Your family
          </h2>
          {overview ? (
            <p className="text-sm text-slate-600">
              {overview.is_primary
                ? "You are the primary member of this family."
                : "You are a member of this family."}{" "}
              Manage invites and members on the{" "}
              <Link
                href="/m/family"
                className="text-slate-900 underline hover:no-underline"
              >
                mobile family hub
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              We couldn&apos;t load your family right now. Please try again.
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Recipients</h2>
            {reviewsOn ? (
              <Link
                href="/settings/care-plan/reviews"
                className="text-sm text-slate-700 underline hover:no-underline"
              >
                Review cadence
              </Link>
            ) : null}
          </div>

          {!familyViewOn ? (
            <ComingSoonCard />
          ) : recipients.length === 0 ? (
            <p className="text-sm text-slate-600">
              No recipients yet. Add someone from the mobile family hub to see
              their care plan here.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {recipients.map((r) => (
                <RecipientCard
                  key={r.id}
                  recipient={r}
                  reviewsOn={reviewsOn}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function ComingSoonCard() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-sm font-medium text-slate-900">
        The family care-plan view is on its way.
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Once enabled, each recipient on your family will show a read-only care
        plan with medications, allergies, and routine notes.
      </p>
    </div>
  );
}

function RecipientCard({
  recipient,
  reviewsOn,
}: {
  recipient: FamilyRecipientTile;
  reviewsOn: boolean;
}) {
  const now = new Date();
  const badge =
    reviewsOn && recipient.next_review
      ? reviewStatusBadge(recipient.next_review, now)
      : null;
  const hasPlan = !!recipient.latest_care_plan_id;
  const targetHref = hasPlan
    ? `/family/recipients/${recipient.id}/care-plan`
    : null;

  const body = (
    <div className="flex items-start gap-3">
      <div className="h-12 w-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
        {recipient.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipient.photo_url}
            alt={recipient.display_name}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900 truncate">
          {recipient.display_name}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {hasPlan ? "Care plan available" : "No care plan yet"}
        </p>
        {badge ? (
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeToneClass(
              badge.tone,
            )}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <li className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition">
      {targetHref ? (
        <Link href={targetHref} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
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
