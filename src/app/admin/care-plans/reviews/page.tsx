/**
 * /admin/care-plans/reviews — admin readout of Reg-9 care-plan reviews.
 *
 * Filters via querystring: ?status=due|overdue|in_progress|completed|skipped|all
 * Default = 'open' (due + overdue + in_progress).
 *
 * Flag off → empty-state card; no data fetched.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReg9ReviewCadenceEnabled } from "@/lib/care-plan/flag";
import { reviewStatusBadge, type CarePlanReviewRow } from "@/lib/care-plan/reviews";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Care-plan reviews — Admin",
  robots: { index: false, follow: false },
};

const STATUS_FILTERS = [
  { key: "open", label: "Open" },
  { key: "due", label: "Due" },
  { key: "overdue", label: "Overdue" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

function statusFilterFrom(input: string | undefined): StatusFilter {
  const match = STATUS_FILTERS.find((s) => s.key === input);
  return match?.key ?? "open";
}

export default async function AdminCarePlanReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = statusFilterFrom(params.status);

  if (!isReg9ReviewCadenceEnabled()) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Care-plan reviews
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
          Reg 9 review cadence is disabled. Set
          <code className="mx-1 px-1 rounded bg-slate-100 text-[12px]">
            NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED=true
          </code>
          to enable this page.
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  let query = admin
    .from("care_plan_reviews")
    .select(
      "id, care_plan_id, scheduled_for, status, completed_at, completed_by, reviewer_notes, next_review_due, cadence_months, event_trigger, last_reminded_at, created_at, updated_at",
    )
    .order("scheduled_for", { ascending: true })
    .limit(200);

  if (filter === "open") {
    query = query.in("status", ["due", "in_progress", "overdue"]);
  } else if (filter !== "all") {
    query = query.eq("status", filter);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as CarePlanReviewRow[];
  const now = new Date();

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">
          Care-plan reviews
        </h1>
        <p className="text-xs text-slate-500">{rows.length} shown</p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const active = s.key === filter;
          return (
            <Link
              key={s.key}
              href={`/admin/care-plans/reviews?status=${s.key}`}
              className={`rounded-full px-3 py-1 text-xs font-medium border ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
          Load failed: {error.message}
        </p>
      ) : null}

      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3">Care plan</th>
              <th className="px-4 py-3">Last reminded</th>
              <th className="px-4 py-3">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
                  No reviews for this filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const badge = reviewStatusBadge(r, now);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-900">
                      {r.scheduled_for}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeToneClass(
                          badge.tone,
                        )}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      Every {r.cadence_months}mo
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-mono text-[11px]">
                      {r.care_plan_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.last_reminded_at
                        ? r.last_reminded_at.slice(0, 10)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {r.completed_at ? r.completed_at.slice(0, 10) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
