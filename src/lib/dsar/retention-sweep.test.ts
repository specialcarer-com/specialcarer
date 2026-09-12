import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleRetentionSweep,
  isDue,
  RETENTION_SWEEP_CONSTANTS,
  type DeferredQueueRow,
  type RetentionSweepClient,
} from "./retention-sweep";

// --------------------------------------------------------------------------
// Test fixtures
// --------------------------------------------------------------------------

const NOW = new Date("2026-09-12T00:00:00Z");
const HORIZON = "2026-09-12";

function makeRow(overrides: Partial<DeferredQueueRow> = {}): DeferredQueueRow {
  return {
    id: overrides.id ?? "row-1",
    dsar_request_id: overrides.dsar_request_id ?? "req-1",
    subject_email: overrides.subject_email ?? "alice@example.com",
    subject_user_id: overrides.subject_user_id ?? "user-1",
    table_name: overrides.table_name ?? "bookings",
    owner_column: overrides.owner_column ?? "seeker_id",
    owner_value: overrides.owner_value ?? "user-1",
    column_name: overrides.column_name ?? null, // null → delete row
    retained_until: overrides.retained_until ?? "2026-01-01",
    state: overrides.state ?? "pending",
    attempt_count: overrides.attempt_count ?? 0,
  };
}

type FakeSpec = {
  rows: DeferredQueueRow[];
  /** Tables that DELETE/UPDATE should report as missing (42P01). */
  missingTables?: Set<string>;
  /** Tables whose write returns an arbitrary error. */
  failingTables?: Map<string, { code?: string; message?: string }>;
  /** Simulate the list query itself failing. */
  listError?: { code?: string; message?: string };
  /** Simulate the queue-row state UPDATE failing. */
  updateStateError?: { message?: string };
  /** Rows the write helpers should report as affected. Default 1. */
  rowsAffected?: number;
};

type Recorder = {
  client: RetentionSweepClient;
  deletes: { table: string; owner_column: string; owner_value: string }[];
  nulls: {
    table: string;
    column: string;
    owner_column: string;
    owner_value: string;
  }[];
  state_updates: Parameters<RetentionSweepClient["updateRowState"]>[0][];
  skips: { row: DeferredQueueRow; reason: string }[];
};

function makeFake(spec: FakeSpec): Recorder {
  const deletes: Recorder["deletes"] = [];
  const nulls: Recorder["nulls"] = [];
  const stateUpdates: Recorder["state_updates"] = [];
  const skips: Recorder["skips"] = [];
  const rowsAffected = spec.rowsAffected ?? 1;

  const client: RetentionSweepClient = {
    async listDueRows(_horizon, _limit) {
      if (spec.listError) return { data: null, error: spec.listError };
      // Enforce the same horizon/state predicate the real client would;
      // the handler's job is to trust the SELECT.
      return { data: spec.rows, error: null };
    },
    async updateRowState(input) {
      stateUpdates.push(input);
      if (spec.updateStateError) return { error: spec.updateStateError };
      return { error: null };
    },
    async hardDeleteRow(input) {
      deletes.push(input);
      if (spec.missingTables?.has(input.table)) {
        return {
          rows_affected: 0,
          error: {
            code: "42P01",
            message: `relation "${input.table}" does not exist`,
          },
        };
      }
      const failing = spec.failingTables?.get(input.table);
      if (failing) return { rows_affected: 0, error: failing };
      return { rows_affected: rowsAffected, error: null };
    },
    async nullColumn(input) {
      nulls.push(input);
      if (spec.missingTables?.has(input.table)) {
        return {
          rows_affected: 0,
          error: {
            code: "42P01",
            message: `relation "${input.table}" does not exist`,
          },
        };
      }
      const failing = spec.failingTables?.get(input.table);
      if (failing) return { rows_affected: 0, error: failing };
      return { rows_affected: rowsAffected, error: null };
    },
    async notifySkip(row, reason) {
      skips.push({ row, reason });
    },
  };

  return { client, deletes, nulls, state_updates: stateUpdates, skips };
}

// --------------------------------------------------------------------------
// isDue
// --------------------------------------------------------------------------

describe("isDue", () => {
  it("returns true when retained_until has passed", () => {
    assert.equal(isDue("2026-01-01", HORIZON), true);
  });
  it("returns true when retained_until equals horizon (inclusive)", () => {
    assert.equal(isDue(HORIZON, HORIZON), true);
  });
  it("returns false when retained_until is in the future", () => {
    assert.equal(isDue("2027-01-01", HORIZON), false);
  });
});

// --------------------------------------------------------------------------
// handleRetentionSweep — happy paths
// --------------------------------------------------------------------------

describe("handleRetentionSweep — delete path", () => {
  it("hard-deletes a due whole-row entry and flips state to completed", async () => {
    const row = makeRow(); // column_name null → DELETE
    const rec = makeFake({ rows: [row] });
    const res = await handleRetentionSweep(rec.client, { now: NOW });

    assert.equal(res.ok, true);
    assert.equal(res.processed, 1);
    assert.equal(res.scanned_until, HORIZON);
    assert.equal(rec.deletes.length, 1);
    assert.deepEqual(rec.deletes[0], {
      table: "bookings",
      owner_column: "seeker_id",
      owner_value: "user-1",
    });
    assert.equal(rec.state_updates.length, 1);
    assert.equal(rec.state_updates[0].state, "completed");
    assert.equal(rec.state_updates[0].attempt_count, 1);
    assert.equal(res.results[0].status, "completed");
    assert.equal(res.results[0].action, "delete");
    assert.equal(res.results[0].rows_affected, 1);
  });
});

describe("handleRetentionSweep — null path", () => {
  it("nulls a column and flips state to completed", async () => {
    const row = makeRow({
      column_name: "special_instructions",
      table_name: "care_plans",
      owner_column: "created_by",
    });
    const rec = makeFake({ rows: [row] });
    const res = await handleRetentionSweep(rec.client, { now: NOW });

    assert.equal(rec.nulls.length, 1);
    assert.deepEqual(rec.nulls[0], {
      table: "care_plans",
      column: "special_instructions",
      owner_column: "created_by",
      owner_value: "user-1",
    });
    assert.equal(rec.deletes.length, 0);
    assert.equal(res.results[0].action, "null");
    assert.equal(res.results[0].status, "completed");
  });
});

describe("handleRetentionSweep — batch", () => {
  it("processes every returned row and preserves order", async () => {
    const rows = [
      makeRow({ id: "a", retained_until: "2024-01-01" }),
      makeRow({ id: "b", retained_until: "2025-01-01" }),
      makeRow({ id: "c", retained_until: "2026-01-01" }),
    ];
    const rec = makeFake({ rows });
    const res = await handleRetentionSweep(rec.client, { now: NOW });
    assert.equal(res.processed, 3);
    assert.deepEqual(
      res.results.map((r) => r.id),
      ["a", "b", "c"],
    );
    for (const r of res.results) {
      assert.equal(r.status, "completed");
    }
  });
});

// --------------------------------------------------------------------------
// Safety valves
// --------------------------------------------------------------------------

describe("handleRetentionSweep — safety valves", () => {
  it("refuses to touch a row whose retained_until is in the future", async () => {
    const row = makeRow({ retained_until: "2030-01-01" });
    const rec = makeFake({ rows: [row] });
    const res = await handleRetentionSweep(rec.client, { now: NOW });

    // No write helper called; row not mutated.
    assert.equal(rec.deletes.length, 0);
    assert.equal(rec.nulls.length, 0);
    assert.equal(rec.state_updates.length, 0);
    assert.equal(res.results[0].status, "future_retention");
    assert.match(res.results[0].reason ?? "", /2030-01-01/);
  });

  it("skips + reports 'target_schema_missing' when the target table is absent", async () => {
    const row = makeRow({ table_name: "obsolete_table" });
    const rec = makeFake({
      rows: [row],
      missingTables: new Set(["obsolete_table"]),
    });
    const res = await handleRetentionSweep(rec.client, { now: NOW });

    assert.equal(rec.deletes.length, 1); // attempted
    // But no state update — leave for human reconciliation.
    assert.equal(rec.state_updates.length, 0);
    assert.equal(res.results[0].status, "target_schema_missing");
    assert.match(res.results[0].reason ?? "", /obsolete_table/);
  });

  it("returns skipped='schema_not_ready' if the queue table itself is missing", async () => {
    const rec = makeFake({
      rows: [],
      listError: { code: "42P01", message: 'relation "dsar_deferred_erasure_queue" does not exist' },
    });
    const res = await handleRetentionSweep(rec.client, { now: NOW });
    assert.equal(res.skipped, "schema_not_ready");
    assert.equal(res.processed, 0);
    assert.deepEqual(res.results, []);
  });

  it("reports a non-schema list error via a synthetic result row (no throw)", async () => {
    const rec = makeFake({
      rows: [],
      listError: { message: "network broke" },
    });
    const res = await handleRetentionSweep(rec.client, { now: NOW });
    assert.equal(res.ok, true);
    assert.equal(res.processed, 0);
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].status, "error");
    assert.match(res.results[0].reason ?? "", /network broke/);
  });
});

// --------------------------------------------------------------------------
// Retries + abandonment
// --------------------------------------------------------------------------

describe("handleRetentionSweep — retry ladder", () => {
  it("bumps attempt_count and sets state='error' on a transient failure", async () => {
    const row = makeRow({ attempt_count: 2 });
    const rec = makeFake({
      rows: [row],
      failingTables: new Map([["bookings", { message: "deadlock" }]]),
    });
    const res = await handleRetentionSweep(rec.client, { now: NOW });

    assert.equal(rec.state_updates.length, 1);
    assert.equal(rec.state_updates[0].state, "error");
    assert.equal(rec.state_updates[0].attempt_count, 3);
    assert.equal(rec.state_updates[0].last_error, "deadlock");
    assert.equal(rec.state_updates[0].completed_at, null);
    assert.equal(res.results[0].status, "error");
    assert.equal(res.results[0].attempt_count, 3);
    // Not abandoned yet — no notifySkip.
    assert.equal(rec.skips.length, 0);
  });

  it("abandons a row after MAX_ATTEMPTS-1 previous failures and notifies", async () => {
    const row = makeRow({
      attempt_count: RETENTION_SWEEP_CONSTANTS.DEFAULT_MAX_ATTEMPTS - 1,
    });
    const rec = makeFake({
      rows: [row],
      failingTables: new Map([["bookings", { message: "still broken" }]]),
    });
    const res = await handleRetentionSweep(rec.client, { now: NOW });

    assert.equal(rec.state_updates[0].state, "skipped");
    assert.equal(rec.state_updates[0].attempt_count, RETENTION_SWEEP_CONSTANTS.DEFAULT_MAX_ATTEMPTS);
    assert.equal(res.results[0].status, "abandoned");
    assert.equal(rec.skips.length, 1);
    assert.equal(rec.skips[0].reason, "still broken");
    assert.equal(rec.skips[0].row.id, row.id);
  });

  it("respects a caller-provided max_attempts", async () => {
    const row = makeRow({ attempt_count: 1 });
    const rec = makeFake({
      rows: [row],
      failingTables: new Map([["bookings", { message: "boom" }]]),
    });
    const res = await handleRetentionSweep(rec.client, {
      now: NOW,
      max_attempts: 2,
    });
    assert.equal(rec.state_updates[0].state, "skipped");
    assert.equal(res.results[0].status, "abandoned");
  });

  it("passes an updateRowState error through as a suffix on the reason", async () => {
    const row = makeRow({ attempt_count: 0 });
    const rec = makeFake({
      rows: [row],
      failingTables: new Map([["bookings", { message: "delete failed" }]]),
      updateStateError: { message: "state update failed" },
    });
    const res = await handleRetentionSweep(rec.client, { now: NOW });
    assert.match(res.results[0].reason ?? "", /delete failed/);
    assert.match(res.results[0].reason ?? "", /state update failed/);
  });
});

// --------------------------------------------------------------------------
// Bounded batching + timestamps
// --------------------------------------------------------------------------

describe("handleRetentionSweep — batching + timestamps", () => {
  it("uses the DEFAULT_BATCH_LIMIT constant when none provided", async () => {
    let capturedLimit = 0;
    const rec = makeFake({ rows: [] });
    const original = rec.client.listDueRows;
    rec.client.listDueRows = async (h, limit) => {
      capturedLimit = limit;
      return original.call(rec.client, h, limit);
    };
    await handleRetentionSweep(rec.client, { now: NOW });
    assert.equal(capturedLimit, RETENTION_SWEEP_CONSTANTS.DEFAULT_BATCH_LIMIT);
  });

  it("propagates caller-supplied batch_limit to listDueRows", async () => {
    let capturedLimit = 0;
    const rec = makeFake({ rows: [] });
    const original = rec.client.listDueRows;
    rec.client.listDueRows = async (h, limit) => {
      capturedLimit = limit;
      return original.call(rec.client, h, limit);
    };
    await handleRetentionSweep(rec.client, { now: NOW, batch_limit: 7 });
    assert.equal(capturedLimit, 7);
  });

  it("stamps last_attempt_at and completed_at with the injected `now`", async () => {
    const rec = makeFake({ rows: [makeRow()] });
    await handleRetentionSweep(rec.client, { now: NOW });
    assert.equal(rec.state_updates[0].last_attempt_at, NOW.toISOString());
    assert.equal(rec.state_updates[0].completed_at, NOW.toISOString());
  });

  it("uses `new Date()` when `now` is omitted (smoke test)", async () => {
    const before = Date.now();
    const rec = makeFake({ rows: [makeRow()] });
    await handleRetentionSweep(rec.client);
    const after = Date.now();
    const ts = Date.parse(rec.state_updates[0].last_attempt_at);
    assert.ok(ts >= before && ts <= after);
  });
});
