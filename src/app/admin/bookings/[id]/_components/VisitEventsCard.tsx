import {
  getVisitEventsForAdmin,
  durationMsFromEvents,
  fmtDurationMs,
  clockInDeltaMinutes,
  fmtDelta,
} from "@/lib/admin/visit-events";
import { fmtDateTime } from "@/lib/admin/bookings";

/**
 * Read-only ops view of a visit's GPS clock-in/out events (Sprint 4.5).
 * No mutation — this surface only reads the append-only visit_events log.
 */
export default async function VisitEventsCard({
  bookingId,
  scheduledStartIso,
}: {
  bookingId: string;
  scheduledStartIso: string;
}) {
  const events = await getVisitEventsForAdmin(bookingId);
  const durationMs = durationMsFromEvents(events);
  const deltaMin = clockInDeltaMinutes(scheduledStartIso, events);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Visit events (GPS clock-in/out)
        </h2>
        <div className="flex items-center gap-2 text-xs">
          {durationMs != null && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
              Duration {fmtDurationMs(durationMs)}
            </span>
          )}
          {deltaMin != null && (
            <span
              className={`inline-flex items-center rounded-md px-2 py-1 font-medium ${
                deltaMin > 5
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              Clock-in {fmtDelta(deltaMin)}
            </span>
          )}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-slate-500">
          No clock-in/out events recorded for this visit yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="pb-2 pr-4 font-medium">Time</th>
                <th className="pb-2 pr-4 font-medium">Type</th>
                <th className="pb-2 pr-4 font-medium">Location</th>
                <th className="pb-2 pr-4 font-medium">Accuracy</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-slate-100 align-top"
                >
                  <td className="py-2 pr-4 text-slate-900 whitespace-nowrap">
                    {fmtDateTime(e.event_at)}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                        e.event_type === "clock_in"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {e.event_type === "clock_in" ? "Clock in" : "Clock out"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {e.latitude != null && e.longitude != null ? (
                      <a
                        href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-brand-700 hover:underline"
                      >
                        {e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">
                    {e.accuracy_metres != null
                      ? `${Math.round(e.accuracy_metres)} m`
                      : "—"}
                  </td>
                  <td className="py-2 text-slate-600">
                    {e.notes ? e.notes : <span className="text-slate-400">—</span>}
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
