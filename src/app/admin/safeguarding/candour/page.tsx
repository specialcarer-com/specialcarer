/**
 * Admin queue for duty-of-candour + notifiable-event casework
 * (Phase C — PR C3b).
 *
 * Server component. Guard: `role='admin'`. When RM (Registered Manager)
 * and NI (Nominated Individual) roles are added to `profiles.role`,
 * extend the guard — grep for `TODO(rm-ni-split)` here and elsewhere
 * in this PR.
 *
 * Query-string filters (no client state manager):
 *   ?state=all|open|in-progress|notified|closed (default: all-open,
 *          which maps to state != 'closed' unless the "Closed" tab
 *          is explicitly selected via ?tab=closed)
 *   ?type=<NotifiableType>
 *   ?severity=low|medium|high|critical
 *   ?page=<1-based>
 *   ?tab=open|closed
 *
 * Deploy-safe: catches PG 42P01/42703 from the events select and
 * renders an EmptyState with `schema_not_ready` rather than 500ing.
 * Matches PR #221's payout monitoring page fallback behaviour.
 */
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import SlaBadge from "@/components/candour/SlaBadge";
import type { NotifiableType, Severity, CaseState } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ALL_STATES: readonly CaseState[] = [
  "open",
  "disclosure_in_progress",
  "disclosure_complete",
  "notified_regulator",
  "closed",
];
const OPEN_STATES: readonly CaseState[] = [
  "open",
  "disclosure_in_progress",
  "disclosure_complete",
  "notified_regulator",
];
const TYPES: readonly NotifiableType[] = [
  "death",
  "injury_serious",
  "abuse_alleged",
  "deprivation_of_liberty",
  "incident_police_involved",
  "service_stopped",
  "other",
];
const SEVERITIES: readonly Severity[] = ["low", "medium", "high", "critical"];

type EventRow = {
  id: string;
  type: NotifiableType;
  severity: Severity;
  state: CaseState;
  discovered_at: string;
  subject_person_id: string | null;
  subject_description: string | null;
  reported_by: string;
  regulator_notify_target_at: string | null;
  candour_disclosure_target_at: string | null;
  ni_signoff_at: string | null;
  reporter?: { id?: string | null; name?: string | null } | null;
  subject?: { id?: string | null; name?: string | null } | null;
};

type SearchParams = {
  state?: string;
  type?: string;
  severity?: string;
  page?: string;
  tab?: string;
};

function badgeCls(kind: "type" | "severity" | "state"): string {
  return kind === "state"
    ? "bg-slate-100 text-slate-700 border-slate-200"
    : kind === "severity"
      ? "bg-slate-50 text-slate-700 border-slate-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
}

function formatLondon(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function EmptyState({ reason }: { reason?: "schema_not_ready" | "none" }) {
  if (reason === "schema_not_ready") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-sm font-medium text-amber-800">
          Schema not ready
        </p>
        <p className="mt-1 text-xs text-amber-700">
          The notifiable_events table is not yet available in this
          environment. The queue will populate once the C3a migration
          is applied.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-sm text-slate-600">No open notifiable events.</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSchemaMissing(err: any): boolean {
  const code = err?.code as string | undefined;
  const msg = (err?.message ?? "") as string;
  return (
    code === "42P01" ||
    code === "42703" ||
    /relation .*notifiable_events.* does not exist/i.test(msg) ||
    /could not find the table .*notifiable_events/i.test(msg)
  );
}

export default async function CandourQueuePage(props: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await props.searchParams) ?? {};

  const tab = params.tab === "closed" ? "closed" : "open";
  const pageNum = Math.max(1, Number(params.page ?? "1") || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const stateFilter =
    params.state && ALL_STATES.includes(params.state as CaseState)
      ? (params.state as CaseState)
      : null;
  const typeFilter =
    params.type && TYPES.includes(params.type as NotifiableType)
      ? (params.type as NotifiableType)
      : null;
  const severityFilter =
    params.severity && SEVERITIES.includes(params.severity as Severity)
      ? (params.severity as Severity)
      : null;

  const admin = createAdminClient();
  let query = admin
    .from("notifiable_events")
    .select(
      "id, type, severity, state, discovered_at, subject_person_id, subject_description, reported_by, regulator_notify_target_at, candour_disclosure_target_at, ni_signoff_at",
    );

  if (tab === "closed") {
    query = query.eq("state", "closed").order("ni_signoff_at", {
      ascending: false,
    });
  } else if (stateFilter && stateFilter !== "closed") {
    query = query.eq("state", stateFilter).order("discovered_at", {
      ascending: false,
    });
  } else {
    query = query
      .in("state", OPEN_STATES as unknown as string[])
      .order("discovered_at", { ascending: false });
  }
  if (typeFilter) query = query.eq("type", typeFilter);
  if (severityFilter) query = query.eq("severity", severityFilter);

  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, error } = await query;

  if (error) {
    if (isSchemaMissing(error)) {
      return (
        <QueueLayout params={params} tab={tab}>
          <EmptyState reason="schema_not_ready" />
        </QueueLayout>
      );
    }
    return (
      <QueueLayout params={params} tab={tab}>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          Failed to load: {error.message}
        </div>
      </QueueLayout>
    );
  }

  const rows = (data ?? []) as EventRow[];

  // Best-effort name enrichment (single round-trip). If it fails,
  // rows still render — we degrade to raw UUIDs.
  const reporterIds = Array.from(new Set(rows.map((r) => r.reported_by)));
  const subjectIds = Array.from(
    new Set(
      rows
        .map((r) => r.subject_person_id)
        .filter((v): v is string => !!v),
    ),
  );
  const allIds = Array.from(new Set([...reporterIds, ...subjectIds]));
  let profileMap = new Map<string, string>();
  if (allIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", allIds);
    if (Array.isArray(profs)) {
      profileMap = new Map(
        profs.map((p: { id: string; full_name: string | null }) => [
          p.id,
          p.full_name ?? "(unnamed)",
        ]),
      );
    }
  }

  return (
    <QueueLayout params={params} tab={tab}>
      {rows.length === 0 ? (
        <EmptyState reason="none" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Discovered</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const subject =
                  (r.subject_person_id
                    ? profileMap.get(r.subject_person_id)
                    : null) ??
                  r.subject_description ??
                  "(unspecified)";
                const reporter =
                  profileMap.get(r.reported_by) ?? r.reported_by.slice(0, 8);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/safeguarding/candour/${r.id}`}
                        className="text-slate-900 hover:underline"
                      >
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeCls("type")}`}
                        >
                          {r.type}
                        </span>
                        <span
                          className={`ml-1 inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeCls("severity")}`}
                        >
                          {r.severity}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-800">{subject}</td>
                    <td className="px-3 py-2 text-slate-600">{reporter}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatLondon(r.discovered_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeCls("state")}`}
                      >
                        {r.state}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <SlaBadge
                          target_at={
                            r.regulator_notify_target_at
                              ? new Date(r.regulator_notify_target_at)
                              : null
                          }
                          label="Regulator notify"
                        />
                        <SlaBadge
                          target_at={
                            r.candour_disclosure_target_at
                              ? new Date(r.candour_disclosure_target_at)
                              : null
                          }
                          label="Candour disclosure"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === PAGE_SIZE && (
        <div className="mt-4 flex justify-end">
          <Link
            href={buildHref({ ...params, page: String(pageNum + 1) })}
            className="text-xs text-slate-600 hover:underline"
          >
            Next page →
          </Link>
        </div>
      )}
    </QueueLayout>
  );
}

function QueueLayout({
  params,
  tab,
  children,
}: {
  params: SearchParams;
  tab: "open" | "closed";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Duty of candour + notifiable events
          </h1>
          <p className="text-xs text-slate-500">
            CQC-scoped casework queue. Two SLA clocks per case: regulator
            notification (Reg 16 / Reg 18) and Reg 20 disclosure to the
            affected person.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 text-xs">
        <Link
          href={buildHref({ ...params, tab: "open", page: undefined })}
          className={`rounded-md px-2 py-1 ${tab === "open" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Open
        </Link>
        <Link
          href={buildHref({ ...params, tab: "closed", page: undefined })}
          className={`rounded-md px-2 py-1 ${tab === "closed" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Closed
        </Link>
      </div>

      <form
        method="get"
        action="/admin/safeguarding/candour"
        className="flex flex-wrap items-center gap-2 text-xs"
      >
        <input type="hidden" name="tab" value={tab} />
        <select
          name="state"
          defaultValue={params.state ?? ""}
          className="rounded-md border border-slate-300 bg-white px-2 py-1"
        >
          <option value="">All states</option>
          <option value="open">Open</option>
          <option value="disclosure_in_progress">Disclosure in progress</option>
          <option value="disclosure_complete">Disclosure complete</option>
          <option value="notified_regulator">Notified regulator</option>
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded-md border border-slate-300 bg-white px-2 py-1"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="severity"
          defaultValue={params.severity ?? ""}
          className="rounded-md border border-slate-300 bg-white px-2 py-1"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
        >
          Apply
        </button>
      </form>

      {children}
    </div>
  );
}

function buildHref(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return `/admin/safeguarding/candour${s ? `?${s}` : ""}`;
}
