import Link from "next/link";
import {
  listBookingsForAdmin,
  fmtMoney,
  fmtDateTime,
  statusTone,
  type BookingStatus,
  type BookingsFilter,
} from "@/lib/admin/bookings";

export const dynamic = "force-dynamic";

const STATUSES: { key: BookingStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "paid", label: "Paid" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "paid_out", label: "Paid out" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
  { key: "disputed", label: "Disputed" },
];

function buildQs(filter: BookingsFilter, overrides: Partial<BookingsFilter & { page: number }>) {
  const merged = { ...filter, ...overrides };
  const params = new URLSearchParams();
  if (merged.status && merged.status !== "all") params.set("status", merged.status);
  if (merged.country && merged.country !== "all") params.set("country", merged.country);
  if (merged.currency && merged.currency !== "all") params.set("currency", merged.currency);
  if (merged.q) params.set("q", merged.q);
  if ("page" in overrides && overrides.page && overrides.page > 1)
    params.set("page", String(overrides.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default async function AdminBookings({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    country?: string;
    currency?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const filter: BookingsFilter = {
    status: (sp.status as BookingStatus | "all") || "all",
    country: (sp.country as "GB" | "US" | "all") || "all",
    currency: (sp.currency as "gbp" | "usd" | "all") || "all",
    q: sp.q || undefined,
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, total } = await listBookingsForAdmin(filter, page, 50);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bookings</h1>
        <p className="text-sm text-slate-500 mt-1">
          All bookings across both markets. Click a row for full detail and
          payment actions.
        </p>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {STATUSES.map((s) => {
          const active = filter.status === s.key;
          return (
            <Link
              key={s.key}
              href={`/admin/bookings${buildQs(filter, { status: s.key, page: 1 })}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Other filters */}
      <form
        method="get"
        action="/admin/bookings"
        className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl p-4"
      >
        <input type="hidden" name="status" value={filter.status ?? "all"} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Country</label>
          <select
            name="country"
            defaultValue={filter.country ?? "all"}
            className="text-sm border border-slate-300 rounded-md px-2 py-1"
          >
            <option value="all">All</option>
            <option value="GB">UK</option>
            <option value="US">US</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Currency</label>
          <select
            name="currency"
            defaultValue={filter.currency ?? "all"}
            className="text-sm border border-slate-300 rounded-md px-2 py-1"
          >
            <option value="all">All</option>
            <option value="gbp">GBP</option>
            <option value="usd">USD</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-slate-500 mb-1">
            Search (booking-id prefix or email)
          </label>
          <input
            type="text"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="abc123 or @example.com"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
          />
        </div>
        <button
          type="submit"
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
        >
          Apply
        </button>
        {(filter.country !== "all" || filter.currency !== "all" || filter.q) && (
          <Link
            href={`/admin/bookings${buildQs({ status: filter.status }, { page: 1 })}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No bookings match these filters.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Booking</th>
                <th className="text-left px-4 py-3 font-medium">Seeker</th>
                <th className="text-left px-4 py-3 font-medium">Caregiver</th>
                <th className="text-left px-4 py-3 font-medium">When</th>
                <th className="text-left px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const tone = statusTone(r.status);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/bookings/${r.id}`}
                        className="font-mono text-xs text-brand-700 hover:underline"
                      >
                        {r.id.slice(0, 8)}…
                      </Link>
                      <div className="text-xs text-slate-500">
                        {r.location_city ?? "—"}
                        {r.location_country && ` · ${r.location_country}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">
                        {r.seeker_name ?? "(no name)"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.seeker_email ?? r.seeker_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">
                        {r.caregiver_name ?? "(no name)"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.caregiver_email ?? r.caregiver_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {fmtDateTime(r.starts_at)}
                      <div className="text-slate-500">
                        {r.hours}h · {r.service_type ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-slate-900">
                        {fmtMoney(r.total_cents, r.currency)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Fee {fmtMoney(r.platform_fee_cents, r.currency)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md ${tone.cls}`}
                      >
                        {tone.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/bookings${buildQs(filter, { page: page - 1 })}`}
                className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                ← Newer
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/bookings${buildQs(filter, { page: page + 1 })}`}
                className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
