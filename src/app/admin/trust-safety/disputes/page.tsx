import Link from "next/link";
import { listDisputesForAdmin } from "@/lib/admin/trust-safety";

export const dynamic = "force-dynamic";

function fmtMoney(cents: number, currency: "gbp" | "usd") {
  const sym = currency === "gbp" ? "£" : "$";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DisputesQueuePage() {
  const rows = await listDisputesForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Disputes queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Bookings flagged as disputed. Open the booking to review the
            timeline, then refund or force-release funds.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No open disputes. Caregivers and seekers raise disputes from the
          booking detail page; admins also flag from there.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Booking</th>
                <th className="text-left px-4 py-2 font-medium">Parties</th>
                <th className="text-left px-4 py-2 font-medium">Starts</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-left px-4 py-2 font-medium">Payment</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-700">
                      {r.id.slice(0, 8)}…
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {r.location_country ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-800">
                      {r.seeker_name ?? "Unknown seeker"}
                    </div>
                    <div className="text-xs text-slate-500">
                      → {r.caregiver_name ?? "Unknown caregiver"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {fmtDateTime(r.starts_at)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {fmtMoney(r.total_cents, r.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-700">
                      {r.payment_status ?? "—"}
                    </span>
                    {r.payment_intent_id && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        {r.payment_intent_id.slice(0, 14)}…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/bookings/${r.id}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                    >
                      Triage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
