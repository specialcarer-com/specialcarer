/**
 * Pure handler for the ops geofence-override clock-in (Sprint 4.5 v2).
 *
 * Records an auditable clock_in that bypasses the HARD 50 m geofence when an
 * admin confirms a carer is legitimately at the client (bad geocode, GPS drift,
 * weak fix). Reuses the carer body validation for the geo fields, then enforces
 * the override-specific rules: must be clock_in, and a reason of at least
 * REASON_MIN characters is mandatory (mirrors the DB CHECK constraint).
 *
 * Auth (admin + MFA) is enforced at the route boundary via requireAdminApi;
 * this handler is driven by an injected client so no live DB is needed.
 */
import { parseClockBody, type VisitEventRow } from "@/app/api/bookings/[id]/clock/clock-handler";
import { evaluateGeofence, type Coords } from "@/lib/geo/geofence";

export const REASON_MIN = 20;

export type OverrideBookingRow = {
  id: string;
  caregiver_id: string | null;
};

export type OverrideInsertRow = {
  visit_id: string;
  carer_id: string;
  event_at: string;
  latitude: number;
  longitude: number;
  accuracy_metres: number;
  client_reported_at: string;
  notes: string | null;
  distance_from_client_metres: number | null;
  admin_override_by: string;
  admin_override_reason: string;
  admin_override_at: string;
};

export type OverrideClient = {
  getBooking: (
    visitId: string,
  ) => Promise<{ data: OverrideBookingRow | null; error: { message: string } | null }>;
  /** Client geocoded coords for audit distance, or null when not geocoded. */
  getClientCoords: (
    visitId: string,
  ) => Promise<{ data: Coords | null; error: { message: string } | null }>;
  insertOverrideEvent: (
    row: OverrideInsertRow,
  ) => Promise<{ data: VisitEventRow | null; error: { message: string } | null }>;
};

export type OverrideResult = {
  status: number;
  body: { event: VisitEventRow } | { error: string };
  /** Present on 201 so the route boundary can write the admin audit log. */
  audit?: { eventId: string; distanceMetres: number | null; reason: string };
};

export async function handleGeofenceOverride(args: {
  visitId: string;
  adminId: string;
  body: unknown;
  client: OverrideClient;
  now?: number;
}): Promise<OverrideResult> {
  const { visitId, adminId, body, client } = args;

  const parsed = parseClockBody(body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }
  const input = parsed.value;
  if (input.event_type !== "clock_in") {
    return {
      status: 400,
      body: { error: "geofence override is only for clock_in" },
    };
  }

  const reason =
    typeof (body as Record<string, unknown>).reason === "string"
      ? ((body as Record<string, unknown>).reason as string).trim()
      : "";
  if (reason.length < REASON_MIN) {
    return {
      status: 400,
      body: { error: `reason is required (min ${REASON_MIN} characters)` },
    };
  }

  const bookingRes = await client.getBooking(visitId);
  if (bookingRes.error) {
    return { status: 500, body: { error: "override_failed" } };
  }
  if (!bookingRes.data) {
    return { status: 404, body: { error: "visit not found" } };
  }
  if (!bookingRes.data.caregiver_id) {
    return {
      status: 400,
      body: { error: "visit has no assigned carer to clock in" },
    };
  }
  const carerId = bookingRes.data.caregiver_id;

  // Measure the distance for audit even though we are bypassing the block.
  const coordsRes = await client.getClientCoords(visitId);
  if (coordsRes.error) {
    return { status: 500, body: { error: "override_failed" } };
  }
  const { distanceMetres } = evaluateGeofence({
    carerCoords: { lat: input.latitude, lng: input.longitude },
    clientCoords: coordsRes.data,
    accuracyMetres: input.accuracy_metres,
  });

  const nowIso = new Date(args.now ?? Date.now()).toISOString();
  const insertRes = await client.insertOverrideEvent({
    visit_id: visitId,
    carer_id: carerId,
    event_at: nowIso,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy_metres: input.accuracy_metres,
    client_reported_at: input.client_reported_at,
    notes: input.notes ?? null,
    distance_from_client_metres: distanceMetres,
    admin_override_by: adminId,
    admin_override_reason: reason,
    admin_override_at: nowIso,
  });
  if (insertRes.error || !insertRes.data) {
    return { status: 500, body: { error: "override_failed" } };
  }

  return {
    status: 201,
    body: { event: insertRes.data },
    audit: { eventId: insertRes.data.id, distanceMetres, reason },
  };
}
