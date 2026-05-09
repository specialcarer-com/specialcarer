import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ORG_BOOKING_STATUS_LABEL,
  ORG_BOOKING_STATUS_COLOR,
  SHIFT_MODE_LABEL,
  type OrgBookingStatus,
  type ShiftMode,
} from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Org bookings — Admin" };

/**
 * /admin/org-bookings — Internal ops oversight queue.
 *
 * Shows BOTH org_charge_total and carer_pay_total side-by-side,
 * plus the implied platform margin. Org-facing pages NEVER show carer_pay.
 *
 * Payment model reminder (displayed in header):
 *   - Org pays All Care 4 U Group Ltd via Stripe Invoice (no Connect)
 *   - Carer paid from platform funds on weekly payout cycle
 *   - Platform fronts carer payment before invoice clears (net-14)
 */

type SP = {
  status?: string;
  org?: string;
  from?: string;
  to?: string;
  page?: string;
};

function fmtMoney(cents: number | null, currency = "gbp") {
  if (cents == null) return "—";
  const sym = currency === "usd" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminOrgBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  let q = admin
    .from("bookings")
    .select(
      `id, status, shift_mode, starts_at, ends_at, hours,
       hourly_rate_cents, subtotal_cents, org_charge_total_cents,
       carer_pay_total_cents, currency,
       organization_id, service_user_id, caregiver_id,
       booker_name_snapshot, booker_role_snapshot,
       invoiced_at, stripe_invoice_id,
       sleep_in_org_charge, sleep_in_carer_pay,
       is_recurring_parent, parent_booking_id, created_at`,
      { count: "exact" }
    )
    .eq("booking_source", "org")
    .is("parent_booking_id", null) // top-level only
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (sp.status && sp.status !== "all") q = q.eq("status", sp.status);
  if (sp.org) q = q.eq("organization_id", sp.org);
  if (sp.from) q = q.gte("starts_at", sp.from);
  if (sp.to) q = q.lte("starts_at", sp.to);

  const { data: bookings, count } = await q;

  // Load org names for display
  const orgIds = [...new Set((bookings ?? []).map((b) => b.organization_id as string))];
  const { data: orgs } = orgIds.length
    ? await admin
        .from("organizations")
        .select("id, legal_name, trading_name")
        .in("id", orgIds)
    : { data: [] };
  const orgMap = Object.fromEntries(
    (orgs ?? []).map((o) => [
      o.id,
      (o.legal_name as string | null) ?? (o.trading_name as string | null) ?? "—",
    ])
  );

  const totalPages = Math.ceil((count ?? 0) / limit);

  const statuses = [
    "all", "pending_offer", "offered", "accepted",
    "in_progress", "completed", "invoiced", "cancelled",
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Org bookings oversight
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Internal ops view. Shows both org charge and carer pay (platform margin = difference).
          <br />
          <strong>Payment model:</strong> Org pays All Care 4 U Group Ltd via Stripe Invoice (no Connect).
          Carer paid from platform funds on weekly cycle — independent of invoice status.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/admin/org-bookings${s !== "all" ? `?status=${s}` : ""}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition
              ${(sp.status ?? "all") === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
              }`}
          >
            {s === "all"
              ? "All"
              : ORG_BOOKING_STATUS_LABEL[s as OrgBookingStatus] ?? s}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Booking</th>
              <th className="px-4 py-3 text-left">Organisation</th>
              <th className="px-4 py-3 text-left">Shift</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Org charged</th>
              <th className="px-4 py-3 text-right">Carer pay</th>
              <th className="px-4 py-3 text-right">Platform margin</th>
              <th className="px-4 py-3 text-left">Invoice</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!bookings?.length && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No org bookings found.
                </td>
              </tr>
            )}
            {bookings?.map((b) => {
              const status = b.status as OrgBookingStatus;
              const mode = b.shift_mode as ShiftMode;
              const currency = b.currency as string;
              const orgCharge = b.org_charge_total_cents as number | null;
              const carerPay = b.carer_pay_total_cents as number | null;
              const margin =
                orgCharge != null && carerPay != null
                  ? orgCharge - carerPay
                  : null;

              return (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {(b.id as string).slice(0, 8)}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtDateTime(b.starts_at as string)}
                    </p>
                    {b.is_recurring_parent && (
                      <span className="text-[10px] text-violet-600 font-semibold">
                        4wk pattern
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-900">
                      {orgMap[b.organization_id as string] ?? "—"}
                    </span>
                    {b.booker_name_snapshot && (
                      <p className="text-xs text-gray-500">
                        {b.booker_name_snapshot as string}
                        {b.booker_role_snapshot
                          ? ` · ${b.booker_role_snapshot}`
                          : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">
                      {SHIFT_MODE_LABEL[mode]}
                    </span>
                    <p className="text-xs text-gray-500">
                      {Number(b.hours).toFixed(1)} hrs @ £
                      {(Number(b.hourly_rate_cents) / 100).toFixed(2)}/hr
                    </p>
                    {mode === "sleep_in" && (
                      <p className="text-xs text-indigo-600">
                        Sleep: org £{Number(b.sleep_in_org_charge ?? 100).toFixed(0)} /
                        carer £{Number(b.sleep_in_carer_pay ?? 50).toFixed(0)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        ORG_BOOKING_STATUS_COLOR[status]
                      }`}
                    >
                      {ORG_BOOKING_STATUS_LABEL[status] ?? status}
                    </span>
                  </td>
                  {/* Org charge — this is what appears on the invoice */}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {fmtMoney(orgCharge ?? b.subtotal_cents as number, currency)}
                  </td>
                  {/* Carer pay — INTERNAL ONLY, never shown to org */}
                  <td className="px-4 py-3 text-right text-emerald-700 font-semibold">
                    {fmtMoney(carerPay, currency)}
                  </td>
                  {/* Platform margin */}
                  <td className="px-4 py-3 text-right text-blue-700 font-semibold">
                    {margin != null ? fmtMoney(margin, currency) : "—"}
                    {margin != null && orgCharge && orgCharge > 0 && (
                      <span className="block text-[10px] text-gray-400">
                        {((margin / orgCharge) * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                  {/* Invoice link */}
                  <td className="px-4 py-3">
                    {b.stripe_invoice_id ? (
                      <span className="text-xs font-mono text-purple-600">
                        {(b.stripe_invoice_id as string).slice(0, 12)}…
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {fmtDateTime(b.created_at as string)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          {page > 1 && (
            <Link
              href={`/admin/org-bookings?${new URLSearchParams({ ...sp, page: String(page - 1) })}`}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages} ({count} total)
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/org-bookings?${new URLSearchParams({ ...sp, page: String(page + 1) })}`}
              className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
