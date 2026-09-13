import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkEligibility,
  blockedStateFromBlockers,
  checkActiveBooking,
  checkActiveDispute,
  checkOpenNotifiableEvent,
  checkOutstandingPayout,
  type EligibilityAdminClient,
  type Blocker,
} from "./deletion-eligibility";

// ---------------------------------------------------------------------------
// In-memory Supabase-shaped fake.
//
// The real client's `from(table).select(...).eq(...)` and friends return
// chainable thenables. This fake mimics just enough of the shape for the
// four blocker checks + tests.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

type TableSpec = {
  /** Rows the query returns when it doesn't error. */
  rows?: Row[];
  /** Force an error return regardless of filters. */
  error?: { code?: string; message?: string };
};

function makeClient(tables: Record<string, TableSpec>): EligibilityAdminClient {
  return {
    from(table: string) {
      const spec = tables[table] ?? { rows: [] };
      const result = spec.error
        ? Promise.resolve({ data: null, error: spec.error })
        : Promise.resolve({ data: spec.rows ?? [], error: null });

      // Every call in the chain returns `chain` which is itself a
      // thenable resolving to the final `result`. Only the terminal
      // call is awaited, so intermediate .select/.eq/etc just return
      // this same object.
      const chain: Record<string, unknown> = {
        then: (onFulfilled: (v: unknown) => unknown) =>
          result.then(onFulfilled),
      };
      for (const method of ["select", "eq", "neq", "in", "or"]) {
        chain[method] = () => chain;
      }
      return chain;
    },
  };
}

const USER = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Individual blockers — each returns the right code and message shape.
// ---------------------------------------------------------------------------

describe("checkActiveBooking", () => {
  it("flags active_booking when at least one row comes back", async () => {
    const db = makeClient({
      bookings: {
        rows: [
          { id: "b1", status: "in_progress" },
          { id: "b2", status: "pending" },
        ],
      },
    });
    const blockers = await checkActiveBooking(USER, db);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "active_booking");
    assert.match(blockers[0].message, /2 active or upcoming bookings/);
    assert.equal(blockers[0].resource_id, "b1");
  });

  it("returns empty when no rows", async () => {
    const db = makeClient({ bookings: { rows: [] } });
    assert.deepEqual(await checkActiveBooking(USER, db), []);
  });

  it("returns empty when the table is missing (schema_not_ready)", async () => {
    const db = makeClient({
      bookings: { error: { code: "42P01", message: 'relation "bookings" does not exist' } },
    });
    assert.deepEqual(await checkActiveBooking(USER, db), []);
  });

  it("returns empty when a column is missing (schema_not_ready)", async () => {
    const db = makeClient({
      bookings: { error: { code: "42703", message: 'column "status" does not exist' } },
    });
    assert.deepEqual(await checkActiveBooking(USER, db), []);
  });
});

describe("checkActiveDispute", () => {
  it("flags active_dispute when an unresolved dispute is present", async () => {
    const db = makeClient({
      stripe_dispute_cases: {
        rows: [{ id: "d1", state: "under_review" }],
      },
    });
    const blockers = await checkActiveDispute(USER, db);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "active_dispute");
    assert.equal(blockers[0].resource_id, "d1");
  });

  it("returns empty when no unresolved disputes", async () => {
    const db = makeClient({ stripe_dispute_cases: { rows: [] } });
    assert.deepEqual(await checkActiveDispute(USER, db), []);
  });

  it("returns empty when the dispute table is missing", async () => {
    const db = makeClient({
      stripe_dispute_cases: {
        error: { code: "42P01", message: "relation does not exist" },
      },
    });
    assert.deepEqual(await checkActiveDispute(USER, db), []);
  });
});

describe("checkOpenNotifiableEvent", () => {
  it("flags open_notifiable_event when reporter has an open case", async () => {
    const db = makeClient({
      notifiable_events: { rows: [{ id: "n1", state: "open" }] },
    });
    const blockers = await checkOpenNotifiableEvent(USER, db);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "open_notifiable_event");
    assert.equal(blockers[0].resource_id, "n1");
  });

  it("returns empty when no open cases", async () => {
    const db = makeClient({ notifiable_events: { rows: [] } });
    assert.deepEqual(await checkOpenNotifiableEvent(USER, db), []);
  });

  it("returns empty when the table is missing", async () => {
    const db = makeClient({
      notifiable_events: {
        error: { code: "42P01", message: "relation does not exist" },
      },
    });
    assert.deepEqual(await checkOpenNotifiableEvent(USER, db), []);
  });
});

describe("checkOutstandingPayout", () => {
  it("flags outstanding_payout when payout_alerts has a new row", async () => {
    const db = makeClient({
      payout_alerts: {
        rows: [{ id: "p1", alert_type: "failed", state: "new" }],
      },
    });
    const blockers = await checkOutstandingPayout(USER, db);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].code, "outstanding_payout");
    assert.equal(blockers[0].resource_id, "p1");
  });

  it("returns empty when no alerts in state=new", async () => {
    const db = makeClient({ payout_alerts: { rows: [] } });
    assert.deepEqual(await checkOutstandingPayout(USER, db), []);
  });

  it("returns empty when the table is missing", async () => {
    const db = makeClient({
      payout_alerts: {
        error: { code: "42P01", message: "relation does not exist" },
      },
    });
    assert.deepEqual(await checkOutstandingPayout(USER, db), []);
  });
});

// ---------------------------------------------------------------------------
// Orchestration — checkEligibility mixes all four checks.
// ---------------------------------------------------------------------------

describe("checkEligibility", () => {
  it("returns eligible=true when every check is empty", async () => {
    const result = await checkEligibility(USER, {
      db: makeClient({}),
      checkActiveBooking: async () => [],
      checkActiveDispute: async () => [],
      checkOpenNotifiableEvent: async () => [],
      checkOutstandingPayout: async () => [],
    });
    assert.equal(result.eligible, true);
    assert.deepEqual(result.blockers, []);
  });

  it("aggregates blockers in a stable order (booking → dispute → event → payout)", async () => {
    const result = await checkEligibility(USER, {
      db: makeClient({}),
      checkActiveBooking: async () => [
        { code: "active_booking", message: "b" } as Blocker,
      ],
      checkActiveDispute: async () => [
        { code: "active_dispute", message: "d" } as Blocker,
      ],
      checkOpenNotifiableEvent: async () => [
        { code: "open_notifiable_event", message: "n" } as Blocker,
      ],
      checkOutstandingPayout: async () => [
        { code: "outstanding_payout", message: "p" } as Blocker,
      ],
    });
    assert.equal(result.eligible, false);
    assert.deepEqual(
      result.blockers.map((b) => b.code),
      [
        "active_booking",
        "active_dispute",
        "open_notifiable_event",
        "outstanding_payout",
      ],
    );
  });

  it("treats schema_not_ready in every check as eligible=true (deploy-safe)", async () => {
    const db = makeClient({
      bookings: { error: { code: "42P01", message: "" } },
      stripe_dispute_cases: { error: { code: "42P01", message: "" } },
      notifiable_events: { error: { code: "42P01", message: "" } },
      payout_alerts: { error: { code: "42P01", message: "" } },
    });
    const result = await checkEligibility(USER, { db });
    assert.equal(result.eligible, true);
    assert.deepEqual(result.blockers, []);
  });
});

describe("blockedStateFromBlockers", () => {
  it("maps active_booking to blocked_active_booking", () => {
    assert.equal(
      blockedStateFromBlockers([
        { code: "active_booking", message: "" },
      ]),
      "blocked_active_booking",
    );
  });
  it("maps active_dispute to blocked_active_dispute", () => {
    assert.equal(
      blockedStateFromBlockers([{ code: "active_dispute", message: "" }]),
      "blocked_active_dispute",
    );
  });
  it("maps open_notifiable_event to blocked_open_notifiable_event", () => {
    assert.equal(
      blockedStateFromBlockers([
        { code: "open_notifiable_event", message: "" },
      ]),
      "blocked_open_notifiable_event",
    );
  });
  it("maps outstanding_payout to blocked_outstanding_payout", () => {
    assert.equal(
      blockedStateFromBlockers([
        { code: "outstanding_payout", message: "" },
      ]),
      "blocked_outstanding_payout",
    );
  });
  it("falls back to blocked_other on empty input", () => {
    assert.equal(blockedStateFromBlockers([]), "blocked_other");
  });
});
