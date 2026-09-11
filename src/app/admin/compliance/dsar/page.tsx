import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import DsarRejectButton from "./dsar-reject-button";

const NON_TERMINAL_STATES = new Set(["submitted", "verifying", "in_progress"]);

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  subject_user_id: string | null;
  subject_email: string;
  request_type: string;
  state: string;
  created_at: string;
  verified_at: string | null;
  delivered_at: string | null;
  delivery_object_path: string | null;
  notes: string | null;
};

const STATE_TONE: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700 border-slate-200",
  verifying: "bg-amber-50 text-amber-800 border-amber-200",
  in_progress: "bg-sky-50 text-sky-800 border-sky-200",
  delivered: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

const ALLOWED_STATES = new Set([
  "submitted",
  "verifying",
  "in_progress",
  "delivered",
  "rejected",
  "cancelled",
]);

/**
 * Read-only admin queue view for UK-GDPR data-subject requests.
 *
 * Rejection is an inline action per non-terminal row (see
 * dsar-reject-button.tsx). Erasure PII-nulling still needs a retention
 * policy decision and lands in a follow-up.
 */
export default async function DsarQueuePage(
  props: { searchParams?: Promise<{ state?: string }> },
) {
  await requireAdmin();
  const search = (await props.searchParams) ?? {};
  const filterState =
    search.state && ALLOWED_STATES.has(search.state) ? search.state : null;

  const admin = createAdminClient();
  const q = admin
    .from("dsar_requests")
    .select(
      "id, subject_user_id, subject_email, request_type, state, created_at, verified_at, delivered_at, delivery_object_path, notes",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const { data, error } = filterState
    ? await q.eq("state", filterState)
    : await q;

  // Table missing (pre-migration) — render the empty state, not a
  // stacktrace. Same pattern as A5/B2/B4 admin pages.
  const rows: Row[] = error ? [] : ((data ?? []) as Row[]);
  const schemaMissing =
    !!error &&
    (error.code === "42P01" ||
      /relation .* does not exist/i.test(error.message ?? ""));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <p className="text-xs text-slate-500 uppercase tracking-wide">
          Compliance
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          Data-subject request queue
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl">
          UK GDPR / DPA 2018 access, erasure, rectification and portability
          requests. Fulfilment runs automatically every 15 minutes for
          verified requests linked to an account. Rows without a linked
          account require manual handling.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 text-sm">
        <FilterLink label="All" active={!filterState} href="/admin/compliance/dsar" />
        {["submitted", "verifying", "in_progress", "delivered", "rejected", "cancelled"].map(
          (s) => (
            <FilterLink
              key={s}
              label={s}
              active={filterState === s}
              href={`/admin/compliance/dsar?state=${s}`}
            />
          ),
        )}
      </nav>

      {schemaMissing ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          The <code>dsar_requests</code> table has not been applied to this
          environment yet. The queue will populate once the migration is
          applied.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No requests in this view.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">Received</th>
                <th className="text-left px-3 py-2">Subject email</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">State</th>
                <th className="text-left px-3 py-2">Verified</th>
                <th className="text-left px-3 py-2">Delivered</th>
                <th className="text-left px-3 py-2">Linked</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-800">
                    {row.subject_email}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.request_type}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
                        STATE_TONE[row.state] ?? "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {row.state}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {row.verified_at ? formatDate(row.verified_at) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {row.delivered_at ? formatDate(row.delivered_at) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {row.subject_user_id ? "yes" : "no account"}
                  </td>
                  <td className="px-3 py-2">
                    {NON_TERMINAL_STATES.has(row.state) ? (
                      <DsarRejectButton
                        requestId={row.id}
                        subjectEmail={row.subject_email}
                        requestType={row.request_type}
                      />
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

      <footer className="text-xs text-slate-500">
        Showing up to 200 most recent. Erasure PII-nulling lands in a
        follow-up (needs retention policy alignment).
      </footer>
    </div>
  );
}

function FilterLink({
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
