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
  type ClockEventType,
} from "./clock-handler";

const CARER = "carer-1";
const VISIT = "visit-1";

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
    created_at: eventAt,
  };
}

function makeClient(opts: {
  booking?: ClockBookingRow | null;
  latest?: VisitEventRow | null;
}): { client: ClockClient; inserts: VisitEventRow[] } {
  const inserts: VisitEventRow[] = [];
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
    async insertEvent(row) {
      const created = makeEvent(row.event_type, row.event_at);
      created.notes = row.notes;
      inserts.push(created);
      return created;
    },
  };
  return { client, inserts };
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
