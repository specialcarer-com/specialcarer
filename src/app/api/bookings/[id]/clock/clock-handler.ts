/**
 * Pure handler for a carer clocking in / out of a visit (Sprint 4.5).
 *
 * Body: {
 *   event_type: "clock_in" | "clock_out",
 *   latitude: number, longitude: number, accuracy_metres: number,
 *   client_reported_at: ISO string, notes?: string
 * }
 *
 * Records a self-attesting GPS event against a booking. It does NOT enforce a
 * geofence radius — it stores what the device reports (policy is a follow-up).
 *
 * Auth is enforced by the route wrapper (must be the booking's assigned carer);
 * the handler re-checks assignment against the injected client so the rule is
 * covered by unit tests. Driven by an injected client so no live DB is needed.
 */

export type ClockEventType = "clock_in" | "clock_out";

export type ParsedClockBody = {
  event_type: ClockEventType;
  latitude: number;
  longitude: number;
  accuracy_metres: number;
  client_reported_at: string;
  notes?: string;
};

export type ParseClockResult =
  | { ok: true; value: ParsedClockBody }
  | { ok: false; error: string };

const NOTES_MAX = 1000;

export function parseClockBody(body: unknown): ParseClockResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (b.event_type !== "clock_in" && b.event_type !== "clock_out") {
    return { ok: false, error: "event_type must be clock_in or clock_out" };
  }

  const lat = b.latitude;
  const lng = b.longitude;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "latitude must be a number between -90 and 90" };
  }
  if (
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      ok: false,
      error: "longitude must be a number between -180 and 180",
    };
  }

  const acc = b.accuracy_metres;
  if (typeof acc !== "number" || !Number.isFinite(acc) || acc < 0) {
    return { ok: false, error: "accuracy_metres must be a non-negative number" };
  }

  if (
    typeof b.client_reported_at !== "string" ||
    Number.isNaN(Date.parse(b.client_reported_at))
  ) {
    return { ok: false, error: "client_reported_at must be an ISO timestamp" };
  }

  let notes: string | undefined;
  if (b.notes != null) {
    if (typeof b.notes !== "string") {
      return { ok: false, error: "notes must be a string" };
    }
    const trimmed = b.notes.trim();
    if (trimmed.length > NOTES_MAX) {
      return { ok: false, error: `notes must be ${NOTES_MAX} characters or fewer` };
    }
    notes = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    ok: true,
    value: {
      event_type: b.event_type,
      latitude: lat,
      longitude: lng,
      accuracy_metres: acc,
      client_reported_at: b.client_reported_at,
      notes,
    },
  };
}

/** Minimum gap between two events of the same type on the same visit. */
export const DUPLICATE_WINDOW_MS = 30_000;

export type ClockBookingRow = {
  id: string;
  caregiver_id: string | null;
  status: string;
};

export type VisitEventRow = {
  id: string;
  visit_id: string;
  carer_id: string;
  event_type: ClockEventType;
  event_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_metres: number | null;
  client_reported_at: string | null;
  server_recorded_at: string;
  device_info: unknown;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
};

export type ClockClient = {
  getBooking: (visitId: string) => Promise<ClockBookingRow | null>;
  /** Most recent event of any type on this visit, or null. */
  latestEvent: (visitId: string) => Promise<VisitEventRow | null>;
  insertEvent: (row: {
    visit_id: string;
    carer_id: string;
    event_type: ClockEventType;
    event_at: string;
    latitude: number;
    longitude: number;
    accuracy_metres: number;
    client_reported_at: string;
    device_info: unknown;
    notes: string | null;
  }) => Promise<VisitEventRow>;
};

export type ClockResult =
  | { status: number; body: { event: VisitEventRow } }
  | { status: number; body: { error: string } };

/** Statuses where a carer may reasonably clock in/out. */
const CLOCKABLE_STATUSES = new Set([
  "accepted",
  "paid",
  "in_progress",
  "completed",
]);

export async function handleClock(
  client: ClockClient,
  args: {
    visitId: string;
    carerId: string;
    body: unknown;
    deviceInfo?: unknown;
    now?: number;
  },
): Promise<ClockResult> {
  const parsed = parseClockBody(args.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  const input = parsed.value;

  const booking = await client.getBooking(args.visitId);
  if (!booking) {
    return { status: 404, body: { error: "visit not found" } };
  }
  if (booking.caregiver_id !== args.carerId) {
    return { status: 403, body: { error: "not the assigned carer" } };
  }
  if (!CLOCKABLE_STATUSES.has(booking.status)) {
    return {
      status: 409,
      body: { error: `cannot clock a ${booking.status} visit` },
    };
  }

  const now = args.now ?? Date.now();
  const latest = await client.latestEvent(args.visitId);

  // Events must strictly alternate clock_in → clock_out → clock_in … A carer
  // cannot clock out without an open clock-in, nor clock in twice in a row.
  if (input.event_type === "clock_in" && latest?.event_type === "clock_in") {
    return { status: 409, body: { error: "already_clocked_in" } };
  }
  if (input.event_type === "clock_out" && latest?.event_type !== "clock_in") {
    return { status: 409, body: { error: "no_open_clock_in" } };
  }

  // Rate limit: reject a rapid repeat submit within the window. Guards against a
  // double-tap firing two requests before the first event is visible. The DB
  // also has a per-minute unique index as defence in depth against a race.
  if (latest) {
    const since = now - new Date(latest.event_at).getTime();
    if (since >= 0 && since < DUPLICATE_WINDOW_MS) {
      return { status: 409, body: { error: "duplicate_event" } };
    }
  }

  const event = await client.insertEvent({
    visit_id: args.visitId,
    carer_id: args.carerId,
    event_type: input.event_type,
    event_at: new Date(now).toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_metres: input.accuracy_metres,
    client_reported_at: input.client_reported_at,
    device_info: args.deviceInfo ?? null,
    notes: input.notes ?? null,
  });

  return { status: 201, body: { event } };
}
