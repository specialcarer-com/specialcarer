import { createAdminClient } from "@/lib/supabase/admin";

export type VisitEvent = {
  id: string;
  visit_id: string;
  carer_id: string;
  event_type: "clock_in" | "clock_out";
  event_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_metres: number | null;
  client_reported_at: string | null;
  server_recorded_at: string;
  notes: string | null;
};

const COLS =
  "id, visit_id, carer_id, event_type, event_at, latitude, longitude, accuracy_metres, client_reported_at, server_recorded_at, notes";

/** All clock events for a visit, oldest first. Admin/service-role read. */
export async function getVisitEventsForAdmin(
  visitId: string,
): Promise<VisitEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("visit_events")
    .select(COLS)
    .eq("visit_id", visitId)
    .order("event_at", { ascending: true })
    .returns<VisitEvent[]>();
  return data ?? [];
}

/** Duration from the earliest clock_in to the latest clock_out, in ms. */
export function durationMsFromEvents(events: VisitEvent[]): number | null {
  const firstIn = events
    .filter((e) => e.event_type === "clock_in")
    .map((e) => new Date(e.event_at).getTime())
    .sort((a, b) => a - b)[0];
  const lastOut = events
    .filter((e) => e.event_type === "clock_out")
    .map((e) => new Date(e.event_at).getTime())
    .sort((a, b) => b - a)[0];
  if (firstIn == null || lastOut == null || lastOut <= firstIn) return null;
  return lastOut - firstIn;
}

/** Human "1h 23m" / "23m" from a millisecond duration. */
export function fmtDurationMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Signed minutes between the scheduled start and the actual clock-in.
 * Positive = late, negative = early. Null when there is no clock-in.
 */
export function clockInDeltaMinutes(
  scheduledStartIso: string,
  events: VisitEvent[],
): number | null {
  const firstIn = events
    .filter((e) => e.event_type === "clock_in")
    .map((e) => new Date(e.event_at).getTime())
    .sort((a, b) => a - b)[0];
  if (firstIn == null) return null;
  const scheduled = new Date(scheduledStartIso).getTime();
  return Math.round((firstIn - scheduled) / 60_000);
}

/** "12 min late" / "5 min early" / "on time". */
export function fmtDelta(deltaMin: number): string {
  if (deltaMin === 0) return "on time";
  const abs = Math.abs(deltaMin);
  return deltaMin > 0 ? `${abs} min late` : `${abs} min early`;
}
