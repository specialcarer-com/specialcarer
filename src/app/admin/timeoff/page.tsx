import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import AdminTimeoffActions from "./_components/AdminTimeoffActions";

export const dynamic = "force-dynamic";

type TimeoffRow = {
  id: string;
  user_id: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  cancelled: "bg-slate-50 text-slate-500",
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminTimeoffPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const admin = createAdminClient();

  const sp = await searchParams;
  const statusFilter = sp.status ?? "pending";

  let q = admin
    .from("caregiver_timeoff_requests")
    .select(
      `id, user_id, starts_on, ends_on, reason, status, review_note, reviewed_at, created_at,
       profiles:user_id (first_name, last_name)`,
      { count: "exact" }
    )
    .order("starts_on");

  if (statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }

  const { data: rows, count } = await q;

  const TABS = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "declined", label: "Declined" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Time-off Requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review carer time-off requests. Approving automatically creates a
          block-out for the same period.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = statusFilter === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/timeoff?status=${t.key}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-indigo-600 text-indigo-700 font-medium"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        <span className="ml-auto text-sm text-slate-400">
          {count ?? 0} {statusFilter === "all" ? "total" : statusFilter}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Carer</th>
              <th className="px-4 py-3 text-left font-medium">Period</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Submitted</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows as TimeoffRow[] | null)?.map((row) => {
              const name = [row.profiles?.first_name, row.profiles?.last_name]
                .filter(Boolean)
                .join(" ") || "Unknown";
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="hover:underline text-indigo-700"
                    >
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {fmtDate(row.starts_on)}
                    {row.starts_on !== row.ends_on
                      ? ` – ${fmtDate(row.ends_on)}`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {row.reason}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_STYLE[row.status] ?? "bg-slate-50 text-slate-600"
                      }`}
                    >
                      {row.status}
                    </span>
                    {row.review_note && (
                      <p className="mt-1 text-xs text-slate-400 italic">
                        {row.review_note}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <AdminTimeoffActions requestId={row.id} />
                    )}
                  </td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  No {statusFilter === "all" ? "" : statusFilter} requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
