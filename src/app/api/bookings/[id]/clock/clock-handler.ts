/**
 * Pure handler for a carer clocking in / out of a visit (Sprint 4.5 / v2).
 *
 * Body: {
 *   event_type: "clock_in" | "clock_out",
 *   latitude: number, longitude: number, accuracy_metres: number,
 *   client_reported_at: ISO string, notes?: string,
 *   event_id?: uuid, photo_url?: string, photo_verification_status?: "pending" | "skipped" | "error"
 * }
 *
 * Records a self-attesting GPS event against a booking, and — for clock_in —
 * enforces a HARD 50 m geofence against the client's geocoded address:
 * outside the radius returns 409 and does NOT insert. Photo capture is
 * advisory: the selfie path/status ride along on the insert and are never a
 * gate here (the match engine is deferred; verification stays `pending`).
 *
 * Auth is enforced by the route wrapper (must be the booking's assigned carer);
 * the handler re-checks assignment against the injected client so the rule is
 * covered by unit tests. Driven by an injected client so no live DB is needed.
 */

import {
  evaluateGeofence,
  DEFAULT_GEOFENCE_THRESHOLD_METRES,
  type Coords,
} from "@/lib/geo/geofence";

export type ClockEventType = "clock_in" | "clock_out";

/** Photo verification states a carer's device may set at capture time. */
export type CarerPhotoStatus = "pending" | "skipped" | "error";

export type ParsedClockBody = {
  event_type: ClockEventType;
  latitude: number;
  longitude: number;
  accuracy_metres: number;
  client_reported_at: string;
  notes?: string;
  event_id?: string;
  photo_url?: string | null;
  photo_verification_status?: CarerPhotoStatus;
};

export type ParseClockResult =
  | { ok: true; value: ParsedClockBody }
  | { ok: false; error: string };

const NOTES_MAX = 1000;
const PHOTO_URL_MAX = 512;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARER_PHOTO_STATUSES: readonly CarerPhotoStatus[] = [
  "pending",
  "skipped",
  "error",
];

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

  let eventId: string | undefined;
  if (b.event_id != null) {
    if (typeof b.event_id !== "string" || !UUID_RE.test(b.event_id)) {
      return { ok: false, error: "event_id must be a UUID" };
    }
    eventId = b.event_id.toLowerCase();
  }

  let photoUrl: string | null | undefined;
  if (b.photo_url != null) {
    if (typeof b.photo_url !== "string" || b.photo_url.length > PHOTO_URL_MAX) {
      return { ok: false, error: "photo_url must be a string path" };
    }
    const trimmed = b.photo_url.trim();
    photoUrl = trimmed.length > 0 ? trimmed : null;
  }

  let photoStatus: CarerPhotoStatus | undefined;
  if (b.photo_verification_status != null) {
    if (
      !CARER_PHOTO_STATUSES.includes(
        b.photo_verification_status as CarerPhotoStatus,
      )
    ) {
      // Carers may only set pending/skipped/error — passed/failed are decided
      // by the match engine / ops review, never self-attested.
      return {
        ok: false,
        error: "photo_verification_status must be pending, skipped or error",
      };
    }
    photoStatus = b.photo_verification_status as CarerPhotoStatus;
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
      event_id: eventId,
      photo_url: photoUrl,
      photo_verification_status: photoStatus,
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

export type GeofenceStatusValue =
  | "passed"
  | "failed"
  | "no_client_address"
  | "no_carer_location"
  | "override";

export type PhotoVerificationStatusValue =
  | "pending"
  | "passed"
  | "failed"
  | "skipped"
  | "error";

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
  photo_verification_status: PhotoVerificationStatusValue;
  photo_similarity_score: number | null;
  photo_verification_checked_at: string | null;
  geofence_status: GeofenceStatusValue | null;
  distance_from_client_metres: number | null;
  admin_override_by: string | null;
  admin_override_reason: string | null;
  admin_override_at: string | null;
  verified_by_admin_id: string | null;
  created_at: string;
};

export type InsertEventRow = {
  id?: string;
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
  photo_url: string | null;
  photo_verification_status: PhotoVerificationStatusValue;
  geofence_status: GeofenceStatusValue | null;
  distance_from_client_metres: number | null;
};

export type ClockClient = {
  getBooking: (visitId: string) => Promise<ClockBookingRow | null>;
  /** Most recent event of any type on this visit, or null. */
  latestEvent: (visitId: string) => Promise<VisitEventRow | null>;
  /**
   * The client's geocoded address for this visit, plus a coarse postcode hint
   * for the failure message. `coords` is null when the address has not been
   * geocoded (data-quality gap → `no_client_address`, not a block).
   */
  getClientLocation: (
    visitId: string,
  ) => Promise<{ coords: Coords | null; postcode: string | null }>;
  insertEvent: (row: InsertEventRow) => Promise<VisitEventRow>;
};

export type GeofenceFailedBody = {
  error: "geofence_failed";
  distance_metres: number | null;
  threshold_metres: number;
  address_hint: string | null;
};

export type ClockResult =
  | { status: number; body: { event: VisitEventRow } }
  | { status: number; body: GeofenceFailedBody }
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

  // Geofence — HARD block at 50 m, clock_in only. clock_out is not fenced
  // (a carer may legitimately clock out having moved), so geofence_status stays
  // null for it.
  let geofenceStatus: GeofenceStatusValue | null = null;
  let distanceMetres: number | null = null;
  if (input.event_type === "clock_in") {
    const location = await client.getClientLocation(args.visitId);
    const geo = evaluateGeofence({
      carerCoords: { lat: input.latitude, lng: input.longitude },
      clientCoords: location.coords,
      accuracyMetres: input.accuracy_metres,
    });
    geofenceStatus = geo.status;
    distanceMetres = geo.distanceMetres;

    if (geo.status === "failed") {
      // Outside the radius → do NOT insert. The carer is genuinely elsewhere;
      // an ops override endpoint exists for the auditable exception path.
      return {
        status: 409,
        body: {
          error: "geofence_failed",
          distance_metres: geo.distanceMetres,
          threshold_metres: geo.thresholdMetres,
          address_hint: outwardCode(location.postcode),
        },
      };
    }
    // passed / no_client_address / no_carer_location → allow the insert. The
    // last two are data-quality flags surfaced to ops, not security failures.
  }

  const event = await client.insertEvent({
    ...(input.event_id ? { id: input.event_id } : {}),
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
    photo_url: input.photo_url ?? null,
    // Default to pending; the carer's device may downgrade to skipped/error.
    photo_verification_status: input.photo_verification_status ?? "pending",
    geofence_status: geofenceStatus,
    distance_from_client_metres: distanceMetres,
  });

  return { status: 201, body: { event } };
}

/** Coarse location hint for a geofence-failure message (outward code only). */
function outwardCode(postcode: string | null): string | null {
  if (!postcode) return null;
  const trimmed = postcode.trim();
  if (trimmed.length === 0) return null;
  return trimmed.split(/\s+/)[0].toUpperCase();
}

export { DEFAULT_GEOFENCE_THRESHOLD_METRES };
