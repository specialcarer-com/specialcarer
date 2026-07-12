/**
 * Tests for the carer clock-in/out handler. Drives the pure handler with an
 * in-memory stub client, so no live DB is needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseClockBody,
  handleClock,
  DUPLICATE_WINDOW_MS,
  type ClockClient,
  type ClockBookingRow,
  type VisitEventRow,
  type InsertEventRow,
  type ClockEventType,
} from "./clock-handler";
import type { Coords } from "@/lib/geo/geofence";

const CARER = "carer-1";
const VISIT = "visit-1";

// A client address ~5 m north of the carer's fixed test coords — inside the 50 m
// geofence. 1° latitude ≈ 111320 m, so 0.000045° ≈ 5 m.
const CARER_COORDS: Coords = { lat: 51.5074, lng: -0.1278 };
const CLIENT_NEAR: Coords = { lat: 51.5074 + 0.000045, lng: -0.1278 };
// ~500 m north — well outside the radius.
const CLIENT_FAR: Coords = { lat: 51.5074 + 0.0045, lng: -0.1278 };

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    event_type: "clock_in",
    latitude: 51.5074,
    longitude: -0.1278,
    accuracy_metres: 12,
    client_reported_at: "2026-07-12T09:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(
  type: ClockEventType,
  eventAt: string,
): VisitEventRow {
  return {
    id: `evt-${type}-${eventAt}`,
    visit_id: VISIT,
    carer_id: CARER,
    event_type: type,
    event_at: eventAt,
    latitude: 51.5074,
    longitude: -0.1278,
    accuracy_metres: 12,
    client_reported_at: eventAt,
    server_recorded_at: eventAt,
    device_info: null,
    notes: null,
    photo_url: null,
    photo_verification_status: "pending",
    photo_similarity_score: null,
    photo_verification_checked_at: null,
    geofence_status: null,
    distance_from_client_metres: null,
    admin_override_by: null,
    admin_override_reason: null,
    admin_override_at: null,
    verified_by_admin_id: null,
    created_at: eventAt,
  };
}

function makeClient(opts: {
  booking?: ClockBookingRow | null;
  latest?: VisitEventRow | null;
  clientCoords?: Coords | null;
  clientPostcode?: string | null;
}): { client: ClockClient; inserts: InsertEventRow[]; deletes: string[] } {
  const inserts: InsertEventRow[] = [];
  const deletes: string[] = [];
  const booking =
    opts.booking === undefined
      ? { id: VISIT, caregiver_id: CARER, status: "in_progress" }
      : opts.booking;
  const client: ClockClient = {
    async getBooking() {
      return booking;
    },
    async latestEvent() {
      return opts.latest ?? null;
    },
    async getClientLocation() {
      return {
        coords: opts.clientCoords === undefined ? CLIENT_NEAR : opts.clientCoords,
        postcode: opts.clientPostcode ?? null,
      };
    },
    async insertEvent(row) {
      inserts.push(row);
      const created = makeEvent(row.event_type, row.event_at);
      created.notes = row.notes;
      created.photo_url = row.photo_url;
      created.photo_verification_status = row.photo_verification_status;
      created.geofence_status = row.geofence_status;
      created.distance_from_client_metres = row.distance_from_client_metres;
      return created;
    },
    async deletePhoto(path) {
      deletes.push(path);
    },
  };
  return { client, inserts, deletes };
}

describe("parseClockBody", () => {
  it("accepts a valid clock_in body", () => {
    const r = parseClockBody(validBody());
    assert.equal(r.ok, true);
  });

  it("rejects a missing/invalid event_type", () => {
    assert.equal(parseClockBody(validBody({ event_type: "nope" })).ok, false);
    assert.equal(parseClockBody(validBody({ event_type: undefined })).ok, false);
  });

  it("rejects out-of-range coordinates", () => {
    assert.equal(parseClockBody(validBody({ latitude: 200 })).ok, false);
    assert.equal(parseClockBody(validBody({ longitude: -999 })).ok, false);
    assert.equal(parseClockBody(validBody({ latitude: "x" })).ok, false);
  });

  it("rejects a bad accuracy and timestamp", () => {
    assert.equal(parseClockBody(validBody({ accuracy_metres: -1 })).ok, false);
    assert.equal(
      parseClockBody(validBody({ client_reported_at: "not-a-date" })).ok,
      false,
    );
  });

  it("trims notes and drops empties", () => {
    const r = parseClockBody(validBody({ notes: "  at the door  " }));
    assert.ok(r.ok && r.value.notes === "at the door");
    const empty = parseClockBody(validBody({ notes: "   " }));
    assert.ok(empty.ok && empty.value.notes === undefined);
  });
});

describe("handleClock", () => {
  const base = { visitId: VISIT, carerId: CARER };

  it("201 on a happy-path clock_in and records the event", async () => {
    const { client, inserts } = makeClient({});
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].event_type, "clock_in");
  });

  it("201 on a clock_out that closes an open clock_in", async () => {
    const openedAt = "2026-07-12T08:00:00.000Z";
    const now = Date.parse(openedAt) + 60 * 60_000; // 1h later
    const { client, inserts } = makeClient({
      latest: makeEvent("clock_in", openedAt),
    });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_type: "clock_out" }),
      now,
    });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].event_type, "clock_out");
  });

  it("400 on an invalid body", async () => {
    const { client } = makeClient({});
    const res = await handleClock(client, { ...base, body: { event_type: "x" } });
    assert.equal(res.status, 400);
  });

  it("404 when the visit does not exist", async () => {
    const { client } = makeClient({ booking: null });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 404);
  });

  it("403 when the caller is not the assigned carer", async () => {
    const { client } = makeClient({
      booking: { id: VISIT, caregiver_id: "someone-else", status: "in_progress" },
    });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 403);
  });

  it("409 when the visit status is not clockable", async () => {
    const { client } = makeClient({
      booking: { id: VISIT, caregiver_id: CARER, status: "cancelled" },
    });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 409);
  });

  it("409 already_clocked_in when the latest event is a clock_in", async () => {
    const openedAt = "2026-07-12T08:00:00.000Z";
    const now = Date.parse(openedAt) + 60 * 60_000; // well past the window
    const { client, inserts } = makeClient({
      latest: makeEvent("clock_in", openedAt),
    });
    const res = await handleClock(client, { ...base, body: validBody(), now });
    assert.equal(res.status, 409);
    assert.ok("error" in res.body && res.body.error === "already_clocked_in");
    assert.equal(inserts.length, 0);
  });

  it("409 no_open_clock_in on a clock_out with no open clock_in", async () => {
    const { client, inserts } = makeClient({ latest: null });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_type: "clock_out" }),
    });
    assert.equal(res.status, 409);
    assert.ok("error" in res.body && res.body.error === "no_open_clock_in");
    assert.equal(inserts.length, 0);
  });

  it("409 no_open_clock_in on a clock_out after a clock_out", async () => {
    const { client } = makeClient({
      latest: makeEvent("clock_out", "2026-07-12T10:00:00.000Z"),
    });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_type: "clock_out" }),
      now: Date.parse("2026-07-12T11:00:00.000Z"),
    });
    assert.equal(res.status, 409);
    assert.ok("error" in res.body && res.body.error === "no_open_clock_in");
  });

  it("409 duplicate_event on a valid transition within the 30s window", async () => {
    const openedAt = "2026-07-12T09:00:10.000Z";
    const now = Date.parse(openedAt) + 20_000; // 20s later, still in window
    const { client, inserts } = makeClient({
      latest: makeEvent("clock_in", openedAt),
    });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_type: "clock_out" }),
      now,
    });
    assert.equal(res.status, 409);
    assert.ok("error" in res.body && res.body.error === "duplicate_event");
    assert.equal(inserts.length, 0);
  });

  it("allows the next event once the window has elapsed", async () => {
    const openedAt = "2026-07-12T09:00:00.000Z";
    const now = Date.parse(openedAt) + DUPLICATE_WINDOW_MS + 1;
    const { client, inserts } = makeClient({
      latest: makeEvent("clock_in", openedAt),
    });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_type: "clock_out" }),
      now,
    });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
  });
});

describe("handleClock geofence (clock_in hard block)", () => {
  const base = { visitId: VISIT, carerId: CARER };

  it("201 and records geofence_status=passed when inside the radius", async () => {
    const { client, inserts } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].geofence_status, "passed");
    assert.equal(inserts[0].photo_verification_status, "pending");
    assert.ok(
      inserts[0].distance_from_client_metres != null &&
        inserts[0].distance_from_client_metres < 50,
    );
  });

  it("409 geofence_failed and does NOT insert when outside the radius", async () => {
    const { client, inserts } = makeClient({ clientCoords: CLIENT_FAR });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 409);
    assert.ok("error" in res.body && res.body.error === "geofence_failed");
    assert.equal(inserts.length, 0);
    assert.ok(
      "distance_metres" in res.body &&
        typeof res.body.distance_metres === "number" &&
        res.body.distance_metres > 50,
    );
  });

  it("surfaces the outward postcode as address_hint on failure", async () => {
    const { client } = makeClient({
      clientCoords: CLIENT_FAR,
      clientPostcode: "sw1a 1aa",
    });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 409);
    assert.ok(
      "address_hint" in res.body && res.body.address_hint === "SW1A",
    );
  });

  it("201 with geofence_status=no_client_address when address is not geocoded", async () => {
    const { client, inserts } = makeClient({ clientCoords: null });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].geofence_status, "no_client_address");
  });

  it("does not fence a clock_out (geofence_status stays null)", async () => {
    const openedAt = "2026-07-12T08:00:00.000Z";
    const now = Date.parse(openedAt) + 60 * 60_000;
    const { client, inserts } = makeClient({
      latest: makeEvent("clock_in", openedAt),
      clientCoords: CLIENT_FAR,
    });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_type: "clock_out" }),
      now,
    });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].geofence_status, null);
  });

  it("carries the photo path and pending status onto the insert", async () => {
    const { client, inserts } = makeClient({ clientCoords: CLIENT_NEAR });
    const eventId = "11111111-2222-3333-4444-555555555555";
    const res = await handleClock(client, {
      ...base,
      body: validBody({
        event_id: eventId,
        photo_url: `${CARER}/${VISIT}/${eventId}.jpg`,
        photo_verification_status: "pending",
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserts[0].id, eventId);
    assert.equal(inserts[0].photo_url, `${CARER}/${VISIT}/${eventId}.jpg`);
    assert.equal(inserts[0].photo_verification_status, "pending");
  });
});

describe("handleClock photo path binding (#5) and orphan cleanup (#8)", () => {
  const base = { visitId: VISIT, carerId: CARER };
  const evt = "11111111-2222-3333-4444-555555555555";

  it("400 and no insert/delete when photo_url is another carer's prefix", async () => {
    const { client, inserts, deletes } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ photo_url: `carer-999/${VISIT}/${evt}.jpg` }),
    });
    assert.equal(res.status, 400);
    assert.equal(inserts.length, 0);
    // Must NOT touch a path we can't prove belongs to the caller.
    assert.equal(deletes.length, 0);
  });

  it("400 when photo_url is for a different visit", async () => {
    const { client } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ photo_url: `${CARER}/visit-999/${evt}.jpg` }),
    });
    assert.equal(res.status, 400);
  });

  it("400 when photo_url attempts path traversal", async () => {
    const { client, deletes } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ photo_url: `${CARER}/${VISIT}/../../secrets.jpg` }),
    });
    assert.equal(res.status, 400);
    assert.equal(deletes.length, 0);
  });

  it("accepts a bucket-prefixed path that still binds to carer/visit", async () => {
    const { client, inserts } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({
        event_id: evt,
        photo_url: `visit-photos/${CARER}/${VISIT}/${evt}.jpg`,
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
  });

  it("deletes the validated selfie when clock-in is geofence-rejected", async () => {
    const path = `${CARER}/${VISIT}/${evt}.jpg`;
    const { client, inserts, deletes } = makeClient({ clientCoords: CLIENT_FAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_id: evt, photo_url: path }),
    });
    assert.equal(res.status, 409);
    assert.equal(inserts.length, 0);
    assert.deepEqual(deletes, [path]);
  });

  it("deletes the validated selfie on a duplicate/already-clocked-in reject", async () => {
    const path = `${CARER}/${VISIT}/${evt}.jpg`;
    const openedAt = "2026-07-12T08:00:00.000Z";
    const now = Date.parse(openedAt) + 60 * 60_000;
    const { client, deletes } = makeClient({
      latest: makeEvent("clock_in", openedAt),
      clientCoords: CLIENT_NEAR,
    });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_id: evt, photo_url: path }),
      now,
    });
    assert.equal(res.status, 409);
    assert.deepEqual(deletes, [path]);
  });

  it("does NOT delete on a successful clock-in", async () => {
    const path = `${CARER}/${VISIT}/${evt}.jpg`;
    const { client, inserts, deletes } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({ event_id: evt, photo_url: path }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserts.length, 1);
    assert.equal(deletes.length, 0);
  });
});

describe("handleClock verification_note (#11)", () => {
  const base = { visitId: VISIT, carerId: CARER };

  it("carries a skip/error verification_note onto the insert", async () => {
    const { client, inserts } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, {
      ...base,
      body: validBody({
        photo_verification_status: "skipped",
        verification_note: "camera unavailable",
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(inserts[0].verification_note, "camera unavailable");
  });

  it("defaults verification_note to null when absent", async () => {
    const { client, inserts } = makeClient({ clientCoords: CLIENT_NEAR });
    const res = await handleClock(client, { ...base, body: validBody() });
    assert.equal(res.status, 201);
    assert.equal(inserts[0].verification_note, null);
  });

  it("rejects an over-long verification_note", () => {
    const long = "x".repeat(201);
    assert.equal(
      parseClockBody(validBody({ verification_note: long })).ok,
      false,
    );
  });
});
