import Link from "next/link";
import {
  listReviewsForAdmin,
  type ReviewsFilter,
} from "@/lib/admin/trust-safety";
import HideToggle from "./_components/HideToggle";

export const dynamic = "force-dynamic";

const TABS: { key: ReviewsFilter; label: string }[] = [
  { key: "visible", label: "Visible" },
  { key: "low_rating", label: "Low rating (≤2★)" },
  { key: "hidden", label: "Hidden" },
  { key: "all", label: "All" },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stars({ n }: { n: number }) {
  const tone =
    n <= 2 ? "text-rose-600" : n === 3 ? "text-amber-600" : "text-emerald-600";
  return (
    <span className={`text-sm font-semibold ${tone}`}>
      {"★".repeat(n)}
      <span className="text-slate-300">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default async function ReviewsModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter: ReviewsFilter =
    sp.filter === "hidden" ||
    sp.filter === "all" ||
    sp.filter === "low_rating" ||
    sp.filter === "visible"
      ? sp.filter
      : "visible";

  const rows = await listReviewsForAdmin(filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Reviews moderation
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hide or unhide user-submitted reviews. All actions require a reason
            and are recorded in the audit log.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/trust-safety/reviews?filter=${t.key}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-brand-700 font-medium"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No reviews match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-2xl border p-4 ${
                r.hidden_at
                  ? "border-slate-300 bg-slate-50"
                  : r.rating <= 2
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Stars n={r.rating} />
                    {r.hidden_at && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-700 text-white text-[11px] font-semibold uppercase tracking-wider">
                        Hidden
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {fmtDateTime(r.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-800">
                    <span className="font-medium">
                      {r.reviewer_name ?? "Unknown reviewer"}
                    </span>
                    {r.reviewer_email && (
                      <span className="text-slate-500"> · {r.reviewer_email}</span>
                    )}
                    <span className="text-slate-500"> → caregiver </span>
                    <Link
                      href={`/admin/caregivers/${r.caregiver_id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.caregiver_name ?? r.caregiver_id.slice(0, 8)}
                    </Link>
                  </div>
                  {r.body && (
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                      {r.body}
                    </p>
                  )}
                  {r.hidden_at && r.hidden_reason && (
                    <p className="mt-2 text-xs text-slate-500 italic">
                      Hidden reason: {r.hidden_reason}
                    </p>
                  )}
                  <div className="mt-2 text-xs text-slate-400">
                    <Link
                      href={`/admin/bookings/${r.booking_id}`}
                      className="hover:underline"
                    >
                      Booking {r.booking_id.slice(0, 8)}…
                    </Link>
                  </div>
                </div>
                <div className="shrink-0">
                  <HideToggle reviewId={r.id} hidden={!!r.hidden_at} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
