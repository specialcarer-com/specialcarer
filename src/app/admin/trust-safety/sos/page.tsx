import Link from "next/link";
import { listSosForAdmin } from "@/lib/admin/trust-safety";
import SosRowActions from "./SosRowActions";

export const dynamic = "force-dynamic";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SosQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter === "all" ? "all" : "open";
  const rows = await listSosForAdmin(filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            SOS alerts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Users in distress. Acknowledge promptly, contact them, then
            resolve. Every alert page also fired an email to the on-call
            admin.
          </p>
        </div>
        <Link
          href="/admin/trust-safety"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Trust &amp; safety
        </Link>
      </div>

      <div className="flex gap-2">
        <Link
          href="/admin/trust-safety/sos"
          className={`text-xs px-3 py-1.5 rounded-full border ${
            filter === "open"
              ? "bg-rose-600 text-white border-rose-600"
              : "bg-white text-slate-700 border-slate-200"
          }`}
        >
          Open only
        </Link>
        <Link
          href="/admin/trust-safety/sos?filter=all"
          className={`text-xs px-3 py-1.5 rounded-full border ${
            filter === "all"
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200"
          }`}
        >
          All recent
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {filter === "open"
            ? "No open SOS alerts. 🎉 Anything raised will appear here in real time."
            : "No SOS alerts in the last 200 records."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Raised</th>
                <th className="text-left px-4 py-2 font-medium">User</th>
                <th className="text-left px-4 py-2 font-medium">Booking</th>
                <th className="text-left px-4 py-2 font-medium">Note</th>
                <th className="text-left px-4 py-2 font-medium">Location</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const mapsUrl =
                  r.lat !== null && r.lng !== null
                    ? `https://www.google.com/maps?q=${r.lat},${r.lng}`
                    : null;
                const statusClass =
                  r.status === "open"
                    ? "bg-rose-100 text-rose-800"
                    : r.status === "acknowledged"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800";
                return (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-800">
                        {fmtDateTime(r.created_at)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {r.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-slate-800">
                        {r.user_name ?? "(no name)"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.user_email ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.booking_id ? (
                        <Link
                          href={`/admin/bookings/${r.booking_id}`}
                          className="text-xs font-mono text-brand-700 hover:underline"
                        >
                          {r.booking_id.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top max-w-[280px]">
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">
                        {r.note ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {mapsUrl ? (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-700 hover:underline"
                        >
                          {r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}
                          {r.accuracy_m
                            ? ` (±${Math.round(r.accuracy_m)}m)`
                            : ""}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Not provided
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <SosRowActions id={r.id} status={r.status} />
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
