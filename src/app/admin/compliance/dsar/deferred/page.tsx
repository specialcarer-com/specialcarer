import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFERRED_QUEUE_PAGE_SIZE,
  DEFERRED_QUEUE_STATES,
  addDaysIso,
  classifyDeferredRow,
  londonTodayIso,
  parseDeferredQueueFilter,
  serialiseDeferredQueueFilter,
  summariseDeferredQueue,
  type DeferredQueueFilter,
  type DeferredQueueViewRow,
} from "@/lib/dsar/deferred-queue-view";
import DeferredQueueActions from "./deferred-queue-actions";

export const dynamic = "force-dynamic";

const QUEUE_TABLE = "dsar_deferred_erasure_queue";
const QUEUE_COLUMNS =
  "id, dsar_request_id, subject_email, subject_user_id, table_name, owner_column, owner_value, column_name, retained_until, state, attempt_count, last_attempt_at, last_error, completed_at, created_at";

const BADGE_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  processing: "bg-sky-50 text-sky-800 border-sky-200",
  overdue: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-rose-50 text-rose-800 border-rose-200",
  abandoned: "bg-red-100 text-red-900 border-red-300",
  skipped: "bg-slate-100 text-slate-500 border-slate-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default async function DsarDeferredQueuePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const search = (await props.searchParams) ?? {};
  const filter = parseDeferredQueueFilter(search);
  const today = londonTodayIso();

  const admin = createAdminClient();

  // Build the query. Ordering: overdue first (retained_until asc),
  // then most-recently-updated so newly-errored rows float to the top.
  let query = admin
    .from(QUEUE_TABLE)
    .select(QUEUE_COLUMNS)
    .order("retained_until", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(DEFERRED_QUEUE_PAGE_SIZE);

  if (filter.states.length > 0) {
    query = query.in("state", filter.states as string[]);
  }
  if (filter.due === "overdue") {
    query = query.lte("retained_until", today).in("state", ["pending", "error"]);
  } else if (filter.due === "upcoming") {
    const upcomingCutoff = addDaysIso(today, 30);
    query = query
      .gt("retained_until", today)
      .lte("retained_until", upcomingCutoff)
      .eq("state", "pending");
  }
  if (filter.q) {
    // Case-insensitive substring across the three most-searched fields.
    // PostgREST `or` with `.ilike` requires a comma-joined arg string.
    const like = `%${filter.q.replace(/[,%]/g, "")}%`;
    query = query.or(
      `subject_email.ilike.${like},table_name.ilike.${like},dsar_request_id.ilike.${like}`,
    );
  }

  const { data, error } = await query;

  const rows: DeferredQueueViewRow[] = error
    ? []
    : ((data ?? []) as DeferredQueueViewRow[]);

  const schemaMissing =
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.code === "PGRST106" ||
      /relation .* does not exist|could not find the table/i.test(
        error.message ?? "",
      ));

  const summary = summariseDeferredQueue(rows, today);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide">
          <Link
            href="/admin/compliance/dsar"
            className="text-teal-700 hover:underline"
          >
            DSAR queue
          </Link>
          <span>·</span>
          <span>Deferred hard-delete queue</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Deferred erasure queue
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Rows queued for a future hard-delete because UK law required
          them retained past the erasure request date (HMRC 6y, NHSX 6y,
          minors&apos; records to age 25, etc.). The retention-sweep cron
          runs nightly at 04:00 UTC and executes any row whose
          <code className="mx-1 text-xs">retained_until</code>has passed.
          Use this page to unstick errored rows or to permanently skip
          rows that have already been removed through another channel.
        </p>
      </header>

      <SummaryStrip summary={summary} />

      <FilterBar filter={filter} today={today} />

      {schemaMissing ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          The <code>{QUEUE_TABLE}</code> table has not been applied to this
          environment yet. The queue will populate once the C1 migration
          is applied.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No queue rows match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Retained until</th>
                <th className="text-left px-3 py-2">Subject email</th>
                <th className="text-left px-3 py-2">Table · action</th>
                <th className="text-left px-3 py-2">Owner</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Attempts</th>
                <th className="text-left px-3 py-2">Last error</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const badge = classifyDeferredRow(row, today);
                const actionLabel = row.column_name
                  ? `SET ${row.column_name}=NULL`
                  : "DELETE row";
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-mono text-xs">
                      {row.retained_until}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-800 max-w-[220px] truncate">
                      {row.subject_email}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <span className="font-mono text-slate-800">
                        {row.table_name}
                      </span>
                      <br />
                      <span className="text-slate-500">{actionLabel}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 max-w-[180px] truncate">
                      {row.owner_column}=
                      <span className="text-slate-800">{row.owner_value}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                          BADGE_TONE[badge] ??
                          "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {badge}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">
                      {row.attempt_count}
                      {row.last_attempt_at ? (
                        <span className="block text-slate-400">
                          last {formatShortDate(row.last_attempt_at)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 max-w-[280px] truncate">
                      {row.last_error ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <DeferredQueueActions row={row} today={today} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="text-xs text-slate-500 space-y-1">
        <div>
          Showing up to {DEFERRED_QUEUE_PAGE_SIZE} rows. Retry resets an
          errored / abandoned row to <code>pending</code> so the next
          cron tick picks it up; the retention window is enforced.
          Manually skipping is permanent and audited.
        </div>
        <div>
          Sweep cron:{" "}
          <code>/api/cron/dsar-retention-sweep</code> (nightly 04:00 UTC).
        </div>
      </footer>
    </div>
  );
}

function SummaryStrip({
  summary,
}: {
  summary: ReturnType<typeof summariseDeferredQueue>;
}) {
  const stat = (label: string, value: number, tone: string) => (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
      {stat("Visible", summary.total, "border-slate-200 text-slate-700")}
      {stat("Overdue", summary.overdue, "border-amber-200 bg-amber-50 text-amber-900")}
      {stat("Errored", summary.error, "border-rose-200 bg-rose-50 text-rose-900")}
      {stat("Abandoned", summary.abandoned, "border-red-300 bg-red-100 text-red-900")}
      {stat(
        "Upcoming 30d",
        summary.upcoming_30d,
        "border-slate-200 text-slate-700",
      )}
      {stat("Completed", summary.completed, "border-emerald-200 bg-emerald-50 text-emerald-900")}
    </div>
  );
}

function FilterBar({
  filter,
  today,
}: {
  filter: DeferredQueueFilter;
  today: string;
}) {
  const linkFor = (patch: Partial<DeferredQueueFilter>) => {
    const merged: DeferredQueueFilter = {
      states: patch.states ?? filter.states,
      due: patch.due ?? filter.due,
      q: patch.q ?? filter.q,
    };
    const qs = serialiseDeferredQueueFilter(merged);
    return `/admin/compliance/dsar/deferred${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-slate-500 pr-1">
          Due
        </span>
        <FilterChip
          label="All"
          href={linkFor({ due: "all" })}
          active={filter.due === "all"}
        />
        <FilterChip
          label={`Overdue (\u2264 ${today})`}
          href={linkFor({ due: "overdue" })}
          active={filter.due === "overdue"}
        />
        <FilterChip
          label="Upcoming 30d"
          href={linkFor({ due: "upcoming" })}
          active={filter.due === "upcoming"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-slate-500 pr-1">
          State
        </span>
        <FilterChip
          label="All"
          href={linkFor({ states: [] })}
          active={filter.states.length === 0}
        />
        {DEFERRED_QUEUE_STATES.map((s) => {
          const active = filter.states.includes(s);
          const next = active
            ? filter.states.filter((x) => x !== s)
            : [...filter.states, s];
          return (
            <FilterChip
              key={s}
              label={s}
              href={linkFor({ states: next })}
              active={active}
            />
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "px-3 py-1 rounded-full border border-teal-500 bg-teal-50 text-teal-800 font-medium"
          : "px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
      }
    >
      {label}
    </Link>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
