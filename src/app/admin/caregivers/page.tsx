import Link from "next/link";
import {
  listCaregiversForAdmin,
  readinessLabel,
  type ListFilter,
} from "@/lib/admin/caregivers";
import PublishToggle from "./_components/PublishToggle";

export const dynamic = "force-dynamic";

const FILTERS: { key: ListFilter; label: string }[] = [
  { key: "awaiting_review", label: "Awaiting review" },
  { key: "published", label: "Published" },
  { key: "all", label: "All" },
];

function fmtRate(cents: number | null, currency: "GBP" | "USD" | null) {
  if (cents == null || !currency) return "—";
  const symbol = currency === "USD" ? "$" : "£";
  return `${symbol}${(cents / 100).toFixed(0)}/hr`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminCaregivers({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter: ListFilter =
    sp.filter === "published" || sp.filter === "all"
      ? sp.filter
      : "awaiting_review";

  const rows = await listCaregiversForAdmin(filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Caregivers</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vet caregiver profiles before publish. Required: Stripe payouts
          enabled, country background checks cleared.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Link
              key={f.key}
              href={`/admin/caregivers?filter=${f.key}`}
              className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No caregivers in this view.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Caregiver</th>
                <th className="text-left px-4 py-3 font-medium">Location</th>
                <th className="text-left px-4 py-3 font-medium">Rate</th>
                <th className="text-left px-4 py-3 font-medium">Readiness</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Updated</th>
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => {
                const r = readinessLabel(c);
                return (
                  <tr key={c.user_id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {c.display_name ?? "(no name)"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {c.email ?? c.user_id.slice(0, 8)}
                      </div>
                      <Link
                        href={`/caregiver/${c.user_id}`}
                        target="_blank"
                        className="mt-1 inline-block text-xs text-brand-700 hover:underline"
                      >
                        View public profile ↗
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.city ?? "—"}
                      <div className="text-xs text-slate-500">
                        {c.country ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {fmtRate(c.hourly_rate_cents, c.currency)}
                    </td>
                    <td className="px-4 py-3">
                      {r.ready ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md font-medium">
                          ● Ready
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md font-medium">
                            ● Blocked
                          </span>
                          <ul className="text-xs text-slate-600 list-disc pl-4">
                            {r.blockers.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                          {c.rating_count > 0 && (
                            <p className="text-xs text-slate-400">
                              {c.rating_avg?.toFixed(1)}★ ({c.rating_count})
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.is_published ? (
                        <span className="text-xs font-medium text-emerald-700">
                          Published
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {fmtDate(c.updated_at ?? c.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PublishToggle
                        userId={c.user_id}
                        isPublished={c.is_published}
                        ready={r.ready}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Showing up to 200 most-recently-updated profiles. Publish overrides
        require a reason and are recorded in the audit log.
      </p>
    </div>
  );
}
