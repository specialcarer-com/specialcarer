import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import RequestLeaveButton from "./_components/RequestLeaveButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Holiday pot — SpecialCarer" };

type LedgerRow = {
  id: string;
  entry_type: "accrued" | "debited_paid_leave" | "adjusted" | "expired";
  amount_cents: number;
  created_at: string;
  notes: string | null;
};

type LeaveRow = {
  id: string;
  requested_hours: number;
  requested_amount_cents: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

const gbp = (p: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((p ?? 0) / 100);

const ENTRY_LABEL: Record<LedgerRow["entry_type"], string> = {
  accrued: "Accrued",
  debited_paid_leave: "Paid leave taken",
  adjusted: "Adjustment",
  expired: "Expired",
};

const ENTRY_STYLE: Record<LedgerRow["entry_type"], string> = {
  accrued: "bg-emerald-50 text-emerald-700",
  debited_paid_leave: "bg-amber-50 text-amber-700",
  adjusted: "bg-slate-100 text-slate-700",
  expired: "bg-red-50 text-red-700",
};

export default async function CarerHolidayPotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/holiday-pot");

  const admin = createAdminClient();

  const [{ data: balance }, { data: entries }, { data: pending }] =
    await Promise.all([
      admin
        .from("v_holiday_pot_balances")
        .select(
          "accrued_cents, debited_cents, adjusted_cents, expired_cents, balance_cents, last_entry_at",
        )
        .eq("carer_id", user.id)
        .maybeSingle<{
          accrued_cents: number | null;
          debited_cents: number | null;
          adjusted_cents: number | null;
          expired_cents: number | null;
          balance_cents: number | null;
          last_entry_at: string | null;
        }>(),
      admin
        .from("holiday_pot_ledger")
        .select("id, entry_type, amount_cents, created_at, notes")
        .eq("carer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("leave_requests")
        .select(
          "id, requested_hours, requested_amount_cents, status, start_date, end_date, created_at",
        )
        .eq("carer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const accrued = balance?.accrued_cents ?? 0;
  const debited = Math.abs(balance?.debited_cents ?? 0);
  const balanceCents = balance?.balance_cents ?? 0;
  const ledger = (entries ?? []) as LedgerRow[];
  const requests = (pending ?? []) as LeaveRow[];
  const pendingRequestCents = requests
    .filter((r) => r.status === "pending")
    .reduce((s, r) => s + (r.requested_amount_cents ?? 0), 0);
  const availableCents = Math.max(0, balanceCents - pendingRequestCents);

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Holiday pot</h1>
        <p className="text-sm text-slate-600 mt-1">
          12.07% of your gross pay is accrued here as paid-leave entitlement
          under the UK Working Time Regulations. Request paid leave to draw it
          down — your manager will review and the payout will land in your next
          payslip.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Available balance
            </div>
            <div className="mt-1 text-4xl font-semibold" style={{ color: "#0E7C7B" }}>
              {gbp(balanceCents)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-slate-600">
                Accrued: <strong className="text-slate-900">{gbp(accrued)}</strong>
              </span>
              <span className="text-slate-600">
                Paid out: <strong className="text-slate-900">{gbp(debited)}</strong>
              </span>
              {pendingRequestCents > 0 && (
                <span className="text-amber-700">
                  Pending requests:{" "}
                  <strong>{gbp(pendingRequestCents)}</strong>
                </span>
              )}
            </div>
          </div>
          <RequestLeaveButton
            availableCents={availableCents}
            disabled={availableCents <= 0}
          />
        </div>

        {requests.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-slate-900">Your requests</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Requested</th>
                    <th className="px-4 py-2.5 text-left font-medium">Hours</th>
                    <th className="px-4 py-2.5 text-left font-medium">Amount</th>
                    <th className="px-4 py-2.5 text-left font-medium">Dates</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 text-slate-600">
                        {new Date(r.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {Number(r.requested_hours).toFixed(2)}h
                      </td>
                      <td className="px-4 py-2.5 text-slate-900 font-medium">
                        {gbp(r.requested_amount_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.start_date ?? "—"}
                        {r.end_date && r.end_date !== r.start_date
                          ? ` → ${r.end_date}`
                          : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-left font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ENTRY_STYLE[row.entry_type]}`}
                      >
                        {ENTRY_LABEL[row.entry_type]}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-2.5 font-medium whitespace-nowrap ${
                        row.amount_cents >= 0 ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {row.amount_cents >= 0 ? "+" : ""}
                      {gbp(row.amount_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{row.notes ?? "—"}</td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      No holiday-pot activity yet. Your first accrual will appear
                      after your next confirmed payslip.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
