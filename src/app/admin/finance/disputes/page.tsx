import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import FinanceTabs from "../_tabs";
import MarkEvidenceSubmittedButton from "./mark-evidence-submitted-button";

export const dynamic = "force-dynamic";

const CASE_TABLE = "stripe_dispute_cases";
const CASE_COLUMNS =
  "id, booking_id, stripe_charge_id, stripe_dispute_id, state, reason, amount_cents, currency, evidence_due_at, opened_at, resolved_at, notes";

// Same style vocabulary as PR #214's deferred-erasure queue.
const BADGE_TONE: Record<string, string> = {
  opened: "bg-amber-50 text-amber-800 border-amber-200",
  evidence_submitted: "bg-sky-50 text-sky-800 border-sky-200",
  under_review: "bg-indigo-50 text-indigo-800 border-indigo-200",
  won: "bg-emerald-50 text-emerald-800 border-emerald-200",
  lost: "bg-rose-50 text-rose-800 border-rose-200",
  warning_closed: "bg-slate-100 text-slate-700 border-slate-200",
};

const ALL_STATES = [
  "opened",
  "evidence_submitted",
  "under_review",
  "won",
  "lost",
  "warning_closed",
] as const;

type DisputeCaseRow = {
  id: string;
  booking_id: string | null;
  stripe_charge_id: string | null;
  stripe_dispute_id: string;
  state: (typeof ALL_STATES)[number];
  reason: string | null;
  amount_cents: number | null;
  currency: string | null;
  evidence_due_at: string | null;
  opened_at: string;
  resolved_at: string | null;
  notes: string | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function parseStateFilter(search: SearchParams): {
  states: (typeof ALL_STATES)[number][];
  onlyOpen: boolean;
} {
  const raw = search.state;
  const asList = Array.isArray(raw) ? raw : raw ? raw.split(",") : [];
  const states = asList.filter((s): s is (typeof ALL_STATES)[number] =>
    (ALL_STATES as readonly string[]).includes(s),
  );
  // Default view: not-yet-resolved cases. "?state=all" opens it up.
  const onlyOpen =
    states.length === 0 && (raw === undefined || raw === "" || raw === "open");
  return { states, onlyOpen };
}

export default async function DisputesQueuePage(props: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const search = (await props.searchParams) ?? {};
  const filter = parseStateFilter(search);

  const admin = createAdminClient();

  let query = admin
    .from(CASE_TABLE)
    .select(CASE_COLUMNS)
    // Overdue-first ordering: evidence_due_at asc (nulls last), then
    // most-recently-opened. Keeps the ops eye on what expires next.
    .order("evidence_due_at", { ascending: true, nullsFirst: false })
    .order("opened_at", { ascending: false })
    .limit(200);

  if (filter.onlyOpen) {
    query = query.in("state", [
      "opened",
      "evidence_submitted",
      "under_review",
    ]);
  } else if (filter.states.length > 0) {
    query = query.in("state", filter.states as string[]);
  }

  const { data, error } = await query;
  const rows: DisputeCaseRow[] = error ? [] : ((data ?? []) as DisputeCaseRow[]);

  const schemaMissing =
    !!error &&
    (error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.code === "PGRST106" ||
      /relation .* does not exist|could not find the table/i.test(
        error.message ?? "",
      ));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <FinanceTabs active="/admin/finance/disputes" />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">
          Stripe disputes
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          Live case queue for Stripe chargebacks and warnings. Evidence
          files are uploaded via the Stripe dashboard — the
          &ldquo;Mark evidence submitted&rdquo; button here just records
          that our operator has done so, so the queue stops surfacing the
          row as awaiting response. Payouts on the disputed booking are
          held automatically from{" "}
          <code className="text-xs">charge.dispute.created</code> until
          the case is won.
        </p>
      </header>

      <FilterBar filter={filter} />

      {schemaMissing ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          The <code>{CASE_TABLE}</code> table has not been applied to
          this environment yet. The queue will populate once the C1
          migration is applied.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No dispute cases match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Evidence due</th>
                <th className="text-left px-3 py-2">Dispute</th>
                <th className="text-left px-3 py-2">Booking</th>
                <th className="text-left px-3 py-2">Reason · amount</th>
                <th className="text-left px-3 py-2">State</th>
                <th className="text-left px-3 py-2">Opened</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    <EvidenceDueCell dueAt={row.evidence_due_at} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <a
                      href={`https://dashboard.stripe.com/disputes/${row.stripe_dispute_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 hover:underline"
                    >
                      {row.stripe_dispute_id}
                    </a>
                    {row.stripe_charge_id ? (
                      <span className="block text-slate-500">
                        {row.stripe_charge_id}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                    {row.booking_id ? (
                      <Link
                        href={`/admin/bookings/${row.booking_id}`}
                        className="text-teal-700 hover:underline"
                      >
                        {row.booking_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-amber-700">unresolved</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">
                    <span className="font-medium">
                      {row.reason ?? "—"}
                    </span>
                    <br />
                    <span className="text-slate-500">
                      {formatAmount(row.amount_cents, row.currency)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                        BADGE_TONE[row.state] ??
                        "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {row.state}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                    {formatShortDate(row.opened_at)}
                  </td>
                  <td className="px-3 py-2">
                    {row.state === "opened" || row.state === "under_review" ? (
                      <MarkEvidenceSubmittedButton caseId={row.id} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="text-xs text-slate-500 space-y-1">
        <div>
          Evidence files are the Stripe dashboard&rsquo;s responsibility —
          upload there. This button only records &ldquo;we submitted&rdquo;
          so the row stops being flagged as awaiting our response.
        </div>
        <div>
          Payout hold: bookings marked{" "}
          <code>carer_payout_hold_reason=&apos;dispute_open&apos;</code>
          are skipped by the weekly release-payouts cron until{" "}
          <code>charge.dispute.closed</code> with{" "}
          <code>status=&apos;won&apos;</code>.
        </div>
      </footer>
    </div>
  );
}

function EvidenceDueCell({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return <span className="text-slate-400">—</span>;
  const due = new Date(dueAt);
  const hoursLeft = (due.getTime() - Date.now()) / (60 * 60 * 1000);
  const cls =
    hoursLeft < 0
      ? "text-rose-700 font-medium"
      : hoursLeft < 48
        ? "text-amber-700 font-medium"
        : "text-slate-700";
  const label =
    hoursLeft < 0
      ? `overdue by ${formatHours(-hoursLeft)}`
      : `in ${formatHours(hoursLeft)}`;
  return (
    <span className={cls}>
      <span className="block font-mono text-[11px] text-slate-500">
        {formatShortDate(dueAt)}
      </span>
      {label}
    </span>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function formatAmount(cents: number | null, currency: string | null): string {
  if (cents === null || cents === undefined) return "—";
  const cur = (currency ?? "gbp").toUpperCase();
  const symbol = cur === "GBP" ? "£" : cur === "USD" ? "$" : `${cur} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
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

function FilterBar({
  filter,
}: {
  filter: { states: (typeof ALL_STATES)[number][]; onlyOpen: boolean };
}) {
  const linkFor = (states: string[] | "all" | "open") => {
    if (states === "all") return "/admin/finance/disputes?state=all";
    if (states === "open") return "/admin/finance/disputes";
    return `/admin/finance/disputes?state=${states.join(",")}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs uppercase tracking-wide text-slate-500 pr-1">
        State
      </span>
      <FilterChip
        label="Open"
        href={linkFor("open")}
        active={filter.onlyOpen}
      />
      <FilterChip
        label="All"
        href={linkFor("all")}
        active={!filter.onlyOpen && filter.states.length === 0}
      />
      {ALL_STATES.map((s) => {
        const active = filter.states.length === 1 && filter.states[0] === s;
        return (
          <FilterChip
            key={s}
            label={s}
            href={linkFor([s])}
            active={active}
          />
        );
      })}
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
