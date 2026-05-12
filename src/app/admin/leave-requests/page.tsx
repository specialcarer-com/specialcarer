import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import LeaveRequestActions from "./_components/LeaveRequestActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leave requests — Admin" };

type LeaveRow = {
  id: string;
  carer_id: string;
  requested_hours: number;
  requested_amount_cents: number;
  status: string;
  reason: string | null;
  start_date: string | null;
  end_date: string | null;
  admin_notes: string | null;
  decided_at: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-slate-50 text-slate-500",
  paid: "bg-brand-50 text-brand-700",
};

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminLeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const sp = await searchParams;
  const statusFilter = sp.status ?? "pending";

  let q = admin
    .from("leave_requests")
    .select(
      "id, carer_id, requested_hours, requested_amount_cents, status, reason, start_date, end_date, admin_notes, decided_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter !== "all") {
    q = q.eq("status", statusFilter);
  }

  const { data: rows } = await q;
  const requests = (rows ?? []) as LeaveRow[];

  const carerIds = Array.from(new Set(requests.map((r) => r.carer_id)));
  const [{ data: profiles }, { data: balances }] = await Promise.all([
    carerIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", carerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    carerIds.length
      ? admin
          .from("v_holiday_pot_balances")
          .select("carer_id, balance_cents")
          .in("carer_id", carerIds)
      : Promise.resolve({ data: [] as { carer_id: string; balance_cents: number | null }[] }),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [
      (p as { id: string }).id,
      (p as { full_name: string | null }).full_name,
    ]),
  );
  const balanceById = new Map(
    (balances ?? []).map((b) => [
      (b as { carer_id: string }).carer_id,
      (b as { balance_cents: number | null }).balance_cents ?? 0,
    ]),
  );

  const TABS = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "paid", label: "Paid" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Leave requests</h1>
        <p className="text-sm text-slate-500 mt-1">
          Carer requests to draw down from their accrued holiday pot. Approving
          records the decision; the payroll engine will post the matching ledger
          debit and payslip line at the next monthly run.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = statusFilter === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/leave-requests?status=${t.key}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-[#0E7C7B] text-[#0E7C7B] font-medium"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        <span className="ml-auto text-sm text-slate-400">
          {requests.length} {statusFilter === "all" ? "total" : statusFilter}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Carer</th>
              <th className="px-4 py-3 text-left font-medium">Hours</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Balance</th>
              <th className="px-4 py-3 text-left font-medium">Dates</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Submitted</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => {
              const name = nameById.get(r.carer_id) ?? "Unknown";
              const bal = balanceById.get(r.carer_id) ?? 0;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link
                      href={`/admin/users/${r.carer_id}`}
                      className="hover:underline"
                      style={{ color: "#0E7C7B" }}
                    >
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {Number(r.requested_hours).toFixed(2)}h
                  </td>
                  <td className="px-4 py-3 text-slate-900 font-semibold whitespace-nowrap">
                    {gbp(r.requested_amount_cents)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {gbp(bal)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {r.start_date ? fmtDate(r.start_date) : "—"}
                    {r.end_date && r.end_date !== r.start_date
                      ? ` → ${fmtDate(r.end_date)}`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        STATUS_STYLE[r.status] ?? "bg-slate-50 text-slate-600"
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.admin_notes && (
                      <p className="mt-1 text-xs text-slate-400 italic">
                        {r.admin_notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <LeaveRequestActions requestId={r.id} />
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
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
