/**
 * Tests for the ops geofence-override handler. Auth (admin + MFA) is enforced at
 * the route boundary via requireAdminApi and is out of scope here; we drive the
 * pure handler with an in-memory stub client.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleGeofenceOverride,
  REASON_MIN,
  type OverrideClient,
  type OverrideInsertRow,
} from "./override-handler";
import type { VisitEventRow } from "@/app/api/bookings/[id]/clock/clock-handler";
import type { Coords } from "@/lib/geo/geofence";

const VISIT = "visit-1";
const CARER = "carer-1";
const ADMIN = "admin-1";
const REASON = "Carer confirmed on-site, GPS drift from tower block";

const CARER_COORDS: Coords = { lat: 51.5074, lng: -0.1278 };
// ~500 m away — a genuinely failing geofence that the override bypasses.
const CLIENT_FAR: Coords = { lat: 51.5074 + 0.0045, lng: -0.1278 };

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "clock_in",
    latitude: CARER_COORDS.lat,
    longitude: CARER_COORDS.lng,
    accuracy_metres: 12,
    client_reported_at: "2026-07-12T09:00:00.000Z",
    reason: REASON,
    ...overrides,
  };
}

function makeClient(opts: {
  booking?: { id: string; caregiver_id: string | null } | null;
  bookingError?: boolean;
  clientCoords?: Coords | null;
  coordsError?: boolean;
  insertError?: boolean;
}): { client: OverrideClient; inserts: OverrideInsertRow[] } {
  const inserts: OverrideInsertRow[] = [];
  const booking =
    opts.booking === undefined
      ? { id: VISIT, caregiver_id: CARER }
      : opts.booking;
  const client: OverrideClient = {
    async getBooking() {
      if (opts.bookingError) return { data: null, error: { message: "boom" } };
      return { data: booking, error: null };
    },
    async getClientCoords() {
      if (opts.coordsError) return { data: null, error: { message: "boom" } };
      return {
        data: opts.clientCoords === undefined ? CLIENT_FAR : opts.clientCoords,
        error: null,
      };
    },
    async insertOverrideEvent(row) {
      if (opts.insertError) return { data: null, error: { message: "boom" } };
      inserts.push(row);
      const event: VisitEventRow = {
        id: "evt-override-1",
        visit_id: row.visit_id,
        carer_id: row.carer_id,
        event_type: "clock_in",
        event_at: row.event_at,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy_metres: row.accuracy_metres,
        client_reported_at: row.client_reported_at,
        server_recorded_at: row.event_at,
        device_info: { source: "admin_geofence_override" },
        notes: row.notes,
        photo_url: null,
        photo_verification_status: "pending",
        photo_similarity_score: null,
        photo_verification_checked_at: null,
        geofence_status: "override",
        distance_from_client_metres: row.distance_from_client_metres,
        admin_override_by: row.admin_override_by,
        admin_override_reason: row.admin_override_reason,
        admin_override_at: row.admin_override_at,
        verified_by_admin_id: null,
        created_at: row.event_at,
      };
      return { data: event, error: null };
    },
  };
  return { client, inserts };
}

const base = { visitId: VISIT, adminId: ADMIN };

describe("handleGeofenceOverride", () => {
  it("201 happy path: inserts an override event and returns audit data", async () => {
    const { client, inserts } = makeClient({});
    const res = await handleGeofenceOverride({ ...base, body: validBody(), client });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].admin_override_by, ADMIN);
    assert.equal(inserts[0].admin_override_reason, REASON);
    assert.equal(inserts[0].carer_id, CARER);
    assert.ok(res.audit && res.audit.eventId === "evt-override-1");
    assert.ok(
      res.audit.distanceMetres != null && res.audit.distanceMetres > 50,
    );
    assert.ok("event" in res.body && res.body.event.geofence_status === "override");
  });

  it("400 when reason is missing or too short", async () => {
    const { client, inserts } = makeClient({});
    const short = await handleGeofenceOverride({
      ...base,
      body: validBody({ reason: "too short" }),
      client,
    });
    assert.equal(short.status, 400);
    const none = await handleGeofenceOverride({
      ...base,
      body: validBody({ reason: undefined }),
      client,
    });
    assert.equal(none.status, 400);
    assert.equal(inserts.length, 0);
  });

  it("enforces at least REASON_MIN characters", async () => {
    const { client } = makeClient({});
    const exactlyUnder = "x".repeat(REASON_MIN - 1);
    const res = await handleGeofenceOverride({
      ...base,
      body: validBody({ reason: exactlyUnder }),
      client,
    });
    assert.equal(res.status, 400);
  });

  it("400 when the event_type is not clock_in", async () => {
    const { client } = makeClient({});
    const res = await handleGeofenceOverride({
      ...base,
      body: validBody({ event_type: "clock_out" }),
      client,
    });
    assert.equal(res.status, 400);
  });

  it("400 on an invalid geo body", async () => {
    const { client } = makeClient({});
    const res = await handleGeofenceOverride({
      ...base,
      body: validBody({ latitude: 999 }),
      client,
    });
    assert.equal(res.status, 400);
  });

  it("404 when the booking does not exist", async () => {
    const { client } = makeClient({ booking: null });
    const res = await handleGeofenceOverride({ ...base, body: validBody(), client });
    assert.equal(res.status, 404);
  });

  it("400 when the booking has no assigned carer", async () => {
    const { client } = makeClient({
      booking: { id: VISIT, caregiver_id: null },
    });
    const res = await handleGeofenceOverride({ ...base, body: validBody(), client });
    assert.equal(res.status, 400);
  });

  it("500 when the booking read errors", async () => {
    const { client } = makeClient({ bookingError: true });
    const res = await handleGeofenceOverride({ ...base, body: validBody(), client });
    assert.equal(res.status, 500);
    assert.ok("error" in res.body && res.body.error === "override_failed");
  });

  it("500 when the insert errors", async () => {
    const { client } = makeClient({ insertError: true });
    const res = await handleGeofenceOverride({ ...base, body: validBody(), client });
    assert.equal(res.status, 500);
  });

  it("records a null distance when the client address is not geocoded", async () => {
    const { client, inserts } = makeClient({ clientCoords: null });
    const res = await handleGeofenceOverride({ ...base, body: validBody(), client });
    assert.equal(res.status, 201);
    assert.equal(inserts[0].distance_from_client_metres, null);
  });
});
