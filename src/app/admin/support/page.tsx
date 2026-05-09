import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  ticket_number: number;
  subject: string;
  status: string;
  priority: string;
  user_id: string | null;
  assigned_to: string | null;
  channel: string;
  sla_due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-50 text-amber-800 border-amber-200",
  pending: "bg-sky-50 text-sky-800 border-sky-200",
  resolved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
};
const PRIORITY_TONE: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-slate-100 text-slate-700 border-slate-200",
  high: "bg-amber-50 text-amber-800 border-amber-200",
  urgent: "bg-rose-50 text-rose-800 border-rose-200",
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const priority = sp.priority ?? "all";

  const admin = createAdminClient();
  let q = admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, status, priority, user_id, assigned_to, channel, sla_due_at, first_response_at, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all" && (TICKET_STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (
    priority !== "all" &&
    (TICKET_PRIORITIES as readonly string[]).includes(priority)
  ) {
    q = q.eq("priority", priority);
  }
  const { data } = await q;
  const rows = (data ?? []) as Row[];

  const now = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Support tickets
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          SLAs: open=24h · high=4h · urgent=1h. Tickets that have breached SLA
          are flagged in red.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterRow
          name="status"
          current={status}
          options={["open", "pending", "resolved", "closed", "all"]}
        />
        <FilterRow
          name="priority"
          current={priority}
          options={["urgent", "high", "normal", "low", "all"]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No tickets in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Subject</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Priority</th>
                <th className="text-left px-4 py-2.5">Channel</th>
                <th className="text-left px-4 py-2.5">SLA</th>
                <th className="text-left px-4 py-2.5">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const breached =
                  r.sla_due_at &&
                  !r.resolved_at &&
                  new Date(r.sla_due_at).getTime() < now;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {r.ticket_number}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/support/${r.id}`}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {r.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.status] ?? STATUS_TONE.open}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold ${PRIORITY_TONE[r.priority] ?? PRIORITY_TONE.normal}`}
                      >
                        {r.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.channel}</td>
                    <td className="px-4 py-3">
                      {breached ? (
                        <span className="inline-flex text-[11px] px-2 py-0.5 rounded-full border font-semibold bg-rose-50 text-rose-800 border-rose-200">
                          SLA breached
                        </span>
                      ) : r.sla_due_at ? (
                        <span className="text-xs text-slate-500">
                          due {new Date(r.sla_due_at).toLocaleString("en-GB")}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleString("en-GB")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  name,
  current,
  options,
}: {
  name: string;
  current: string;
  options: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">
        {name}
      </span>
      {options.map((o) => (
        <Link
          key={o}
          href={`?${name}=${o}`}
          className={`text-xs px-2.5 py-1 rounded-full border ${
            current === o
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200"
          }`}
        >
          {o}
        </Link>
      ))}
    </div>
  );
}
