import {
  getVisitEventsView,
  durationMsFromEvents,
  fmtDurationMs,
  clockInDeltaMinutes,
  fmtDelta,
  fmtSimilarity,
  type GeofenceStatus,
} from "@/lib/admin/visit-events";
import { fmtDateTime } from "@/lib/admin/bookings";
import VisitPhotoCell from "./VisitPhotoCell";

/**
 * Ops view of a visit's GPS clock-in/out events (Sprint 4.5 v2).
 *
 * Reads the append-only visit_events log plus derived data (signed photo URLs,
 * admin display names) via getVisitEventsView. The only mutation on this surface
 * is the manual photo review inside <VisitPhotoCell>, which posts server-side —
 * the event log itself is never edited here.
 */

const GEOFENCE_BADGE: Record<GeofenceStatus, { label: string; cls: string }> = {
  // passed = brand teal, failed/override = brand peach, unknowns = muted cream.
  passed: { label: "In geofence", cls: "bg-[#E6F5F5] text-[#016E70]" },
  failed: { label: "Outside geofence", cls: "bg-[#FBEEDF] text-[#B9651A]" },
  override: { label: "Override", cls: "bg-[#FBEEDF] text-[#B9651A]" },
  no_client_address: {
    label: "No client address",
    cls: "bg-[#F4EFE6] text-[#0F1416]",
  },
  no_carer_location: {
    label: "No carer location",
    cls: "bg-[#F4EFE6] text-[#0F1416]",
  },
};

function fmtDistance(metres: number | null): string | null {
  if (metres == null || !Number.isFinite(metres)) return null;
  return metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.round(metres)} m`;
}

export default async function VisitEventsCard({
  bookingId,
  scheduledStartIso,
}: {
  bookingId: string;
  scheduledStartIso: string;
}) {
  let view;
  try {
    view = await getVisitEventsView(bookingId);
  } catch {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
          Visit events (GPS clock-in/out)
        </h2>
        <p className="text-sm text-[#B9651A]">
          Couldn&apos;t load visit events. Refresh to try again.
        </p>
      </div>
    );
  }
  const { events, photoUrls, adminNames } = view;
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
                  ? "bg-[#FBEEDF] text-[#B9651A]"
                  : "bg-[#E6F5F5] text-[#016E70]"
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
                <th className="pb-2 pr-4 font-medium">Photo</th>
                <th className="pb-2 pr-4 font-medium">Geofence</th>
                <th className="pb-2 pr-4 font-medium">Location</th>
                <th className="pb-2 pr-4 font-medium">Accuracy</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const geoBadge = e.geofence_status
                  ? GEOFENCE_BADGE[e.geofence_status]
                  : null;
                const distance = fmtDistance(e.distance_from_client_metres);
                const overrideBy = e.admin_override_by
                  ? adminNames[e.admin_override_by] ?? "Admin"
                  : null;
                return (
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
                            ? "bg-[#E6F5F5] text-[#016E70]"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {e.event_type === "clock_in"
                          ? "Clock in"
                          : "Clock out"}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {e.event_type === "clock_in" ? (
                        <VisitPhotoCell
                          eventId={e.id}
                          signedUrl={photoUrls[e.id] ?? null}
                          status={e.photo_verification_status}
                          similarityPct={fmtSimilarity(
                            e.photo_similarity_score,
                          )}
                          verifiedByName={
                            e.verified_by_admin_id
                              ? adminNames[e.verified_by_admin_id] ?? "Admin"
                              : null
                          }
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 align-top">
                      {geoBadge ? (
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium ${geoBadge.cls}`}
                          >
                            {geoBadge.label}
                          </span>
                          {distance && (
                            <span className="text-[11px] text-slate-500">
                              {distance} from client
                            </span>
                          )}
                          {overrideBy && e.admin_override_reason && (
                            <span className="max-w-[220px] text-[11px] text-[#B9651A]">
                              Overridden by {overrideBy} —{" "}
                              {e.admin_override_reason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
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
                      {e.notes ? (
                        e.notes
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
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
