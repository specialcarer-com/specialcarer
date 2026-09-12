/**
 * Tests for the pure handler behind
 * POST /api/admin/dsar/deferred/[id] (C1.4).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleDeferredQueueAction,
  isValidAction,
  isValidRowId,
  normaliseNotes,
  type DeferredQueueActionClient,
} from "./deferred-queue-action";
import type { DeferredQueueViewRow } from "./deferred-queue-view";

const VALID_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-09-12T10:00:00.000Z"); // London 11:00 BST → today = 2026-09-12

function row(overrides: Partial<DeferredQueueViewRow> = {}): DeferredQueueViewRow {
  return {
    id: VALID_ID,
    dsar_request_id: OTHER_ID,
    subject_email: "jane@example.com",
    subject_user_id: null,
    table_name: "payroll_runs",
    owner_column: "user_id",
    owner_value: "33333333-3333-3333-3333-333333333333",
    column_name: null,
    retained_until: "2026-09-01", // past by NOW
    state: "error",
    attempt_count: 3,
    last_attempt_at: "2026-09-11T04:00:00.000Z",
    last_error: "target_schema_missing",
    completed_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

type Call = { name: string; args: unknown };

function mockClient(opts: {
  row?: DeferredQueueViewRow | null;
  fetchError?: { code?: string; message: string };
  retryOk?: boolean;
  retryError?: { code?: string; message: string };
  skipOk?: boolean;
  skipError?: { code?: string; message: string };
  logThrows?: boolean;
}): DeferredQueueActionClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async fetchById(rowId) {
      calls.push({ name: "fetchById", args: rowId });
      if (opts.fetchError) return { data: null, error: opts.fetchError };
      return { data: opts.row ?? null, error: null };
    },
    async markRetry(input) {
      calls.push({ name: "markRetry", args: input });
      if (opts.retryError) return { ok: false, error: opts.retryError };
      return { ok: opts.retryOk ?? true };
    },
    async markSkip(input) {
      calls.push({ name: "markSkip", args: input });
      if (opts.skipError) return { ok: false, error: opts.skipError };
      return { ok: opts.skipOk ?? true };
    },
    async logAction(input) {
      calls.push({ name: "logAction", args: input });
      if (opts.logThrows) throw new Error("audit log unreachable");
    },
  };
}

describe("isValidRowId", () => {
  it("accepts a uuid", () => {
    assert.equal(isValidRowId(VALID_ID), true);
  });
  it("rejects garbage", () => {
    assert.equal(isValidRowId("not-a-uuid"), false);
    assert.equal(isValidRowId(""), false);
    assert.equal(isValidRowId(123), false);
    assert.equal(isValidRowId(undefined), false);
  });
});

describe("isValidAction", () => {
  it("accepts retry/skip", () => {
    assert.equal(isValidAction("retry"), true);
    assert.equal(isValidAction("skip"), true);
  });
  it("rejects anything else", () => {
    assert.equal(isValidAction("delete"), false);
    assert.equal(isValidAction(""), false);
    assert.equal(isValidAction(undefined), false);
  });
});

describe("normaliseNotes", () => {
  it("trims and null-empties", () => {
    assert.equal(normaliseNotes("  hi  "), "hi");
    assert.equal(normaliseNotes(""), null);
    assert.equal(normaliseNotes("   "), null);
    assert.equal(normaliseNotes(undefined), null);
    assert.equal(normaliseNotes(null), null);
    assert.equal(normaliseNotes(42), null);
  });
  it("caps at 500 chars", () => {
    const big = "x".repeat(600);
    assert.equal(normaliseNotes(big)?.length, 500);
  });
});

describe("handleDeferredQueueAction — validation", () => {
  it("400 invalid_id when row id is malformed", async () => {
    const client = mockClient({});
    const r = await handleDeferredQueueAction(
      { row_id: "not-a-uuid", action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "invalid_id");
      assert.equal(r.status, 400);
    }
    assert.equal(client.calls.length, 0);
  });

  it("400 invalid_action when action is unknown", async () => {
    const client = mockClient({});
    // Force the type cast — the runtime path is what matters.
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "delete" as never, now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "invalid_action");
      assert.equal(r.status, 400);
    }
  });
});

describe("handleDeferredQueueAction — retry path", () => {
  it("404 when the row does not exist", async () => {
    const client = mockClient({ row: null });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "not_found");
      assert.equal(r.status, 404);
    }
  });

  it("503 schema_not_ready when the queue table is missing", async () => {
    const client = mockClient({
      fetchError: { code: "42P01", message: 'relation "dsar_deferred_erasure_queue" does not exist' },
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "schema_not_ready");
      assert.equal(r.status, 503);
    }
  });

  it("409 wrong_state when the row is not error/skipped", async () => {
    const client = mockClient({ row: row({ state: "pending" }) });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "wrong_state");
      assert.equal(r.status, 409);
    }
  });

  it("409 retention_active when retained_until is still in the future", async () => {
    const client = mockClient({
      row: row({ state: "error", retained_until: "2027-01-01" }),
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "retention_active");
      assert.equal(r.status, 409);
    }
  });

  it("200 ok on the happy path and logs the action", async () => {
    const client = mockClient({ row: row({ state: "error" }), retryOk: true });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", notes: "reapplied migration", now: NOW },
      client,
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.action, "retry");
      assert.equal(r.row_id, VALID_ID);
    }
    const names = client.calls.map((c) => c.name);
    assert.deepEqual(names, ["fetchById", "markRetry", "logAction"]);
    const log = client.calls.find((c) => c.name === "logAction");
    assert.deepEqual(log?.args, {
      action: "dsar_deferred_queue_retry",
      row_id: VALID_ID,
      dsar_request_id: OTHER_ID,
      subject_email: "jane@example.com",
      notes: "reapplied migration",
    });
  });

  it("409 concurrent_update when the state guard filtered the UPDATE", async () => {
    const client = mockClient({ row: row({ state: "error" }), retryOk: false });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "concurrent_update");
      assert.equal(r.status, 409);
    }
  });

  it("500 write_failed on a real DB error", async () => {
    const client = mockClient({
      row: row({ state: "error" }),
      retryError: { message: "connection reset" },
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "write_failed");
      assert.equal(r.status, 500);
      assert.match(r.detail ?? "", /connection reset/);
    }
  });

  it("audit log failure does not block a successful action", async () => {
    const client = mockClient({
      row: row({ state: "error" }),
      retryOk: true,
      logThrows: true,
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "retry", now: NOW },
      client,
    );
    assert.equal(r.ok, true);
  });
});

describe("handleDeferredQueueAction — skip path", () => {
  it("409 wrong_state when the row is not pending/error", async () => {
    for (const s of ["completed", "skipped", "processing"] as const) {
      const client = mockClient({ row: row({ state: s }) });
      const r = await handleDeferredQueueAction(
        { row_id: VALID_ID, action: "skip", now: NOW },
        client,
      );
      assert.equal(r.ok, false, `state=${s}`);
      if (!r.ok) {
        assert.equal(r.error, "wrong_state");
        assert.equal(r.status, 409);
      }
    }
  });

  it("permits pending even when retained_until is in the future", async () => {
    const client = mockClient({
      row: row({ state: "pending", retained_until: "2027-01-01" }),
      skipOk: true,
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "skip", notes: "record removed via ROPA cleanup", now: NOW },
      client,
    );
    assert.equal(r.ok, true);
    const write = client.calls.find((c) => c.name === "markSkip");
    assert.deepEqual(write?.args, {
      row_id: VALID_ID,
      reason: "record removed via ROPA cleanup",
      completed_at: NOW.toISOString(),
      previous_state: "pending",
    });
  });

  it("uses a default reason when the admin gave no note", async () => {
    const client = mockClient({
      row: row({ state: "error" }),
      skipOk: true,
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "skip", now: NOW },
      client,
    );
    assert.equal(r.ok, true);
    const write = client.calls.find((c) => c.name === "markSkip");
    assert.equal(
      (write?.args as { reason: string }).reason,
      "Manually skipped by admin.",
    );
  });

  it("409 concurrent_update when the state guard filtered the UPDATE", async () => {
    const client = mockClient({ row: row({ state: "pending" }), skipOk: false });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "skip", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "concurrent_update");
  });

  it("503 schema_not_ready when the UPDATE reports the table is missing", async () => {
    const client = mockClient({
      row: row({ state: "pending" }),
      skipError: { code: "PGRST205", message: "could not find the table" },
    });
    const r = await handleDeferredQueueAction(
      { row_id: VALID_ID, action: "skip", now: NOW },
      client,
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "schema_not_ready");
  });
});
