/**
 * E1 — Webhook state-machine unit tests.
 *
 * Covers:
 *   - mark* helpers write the right state and are deploy-safe on
 *     schema_not_ready (42P01 / 42703).
 *   - stuck-row sweeper releases only 'processing' rows older than the
 *     threshold, preserves prior `error` text, and no-ops on empty.
 *   - 12+ path transitions across the state machine, mirroring the
 *     three backfill cases specified in the migration file.
 *   - retry-after-handler-failure semantics: fresh → processing →
 *     failed → (re-claim) → processing → completed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STUCK_THRESHOLD_MS,
  markWebhookEventCompleted,
  markWebhookEventFailed,
  markWebhookEventProcessing,
  sweepStuckProcessingRows,
} from "./webhook-state";

// ---------------------------------------------------------------------------
// Tiny in-memory Supabase-shape client for the tests.
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  state: "pending" | "processing" | "completed" | "failed";
  processed_at: string | null;
  error: string | null;
  last_attempt_at: string;
};

function makeClient(initial: Row[]) {
  const rows: Row[] = initial.map((r) => ({ ...r }));

  const client = {
    _rows: rows,
    from(table: string) {
      if (table !== "stripe_webhook_events") {
        throw new Error(`unexpected table ${table}`);
      }
      let selectCols: string | null = null;
      const filters: Array<
        | { kind: "eq"; col: keyof Row; val: unknown }
        | { kind: "lt"; col: keyof Row; val: unknown }
      > = [];
      let update: Partial<Row> | null = null;
      let limitN = Infinity;

      const q = {
        select(cols: string) {
          selectCols = cols;
          return q;
        },
        eq(col: keyof Row, val: unknown) {
          filters.push({ kind: "eq", col, val });
          return q;
        },
        lt(col: keyof Row, val: unknown) {
          filters.push({ kind: "lt", col, val });
          return q;
        },
        limit(n: number) {
          limitN = n;
          return q;
        },
        update(patch: Partial<Row>) {
          update = patch;
          return q;
        },
        async then(resolve: (v: { data: unknown; error: unknown }) => void) {
          const matches = rows.filter((r) =>
            filters.every((f) => {
              if (f.kind === "eq") return r[f.col] === f.val;
              if (f.kind === "lt") return (r[f.col] as string) < (f.val as string);
              return false;
            }),
          );
          if (update) {
            for (const r of matches) Object.assign(r, update);
            resolve({ data: null, error: null });
            return;
          }
          const shaped = matches
            .slice(0, limitN)
            .map((r) =>
              selectCols
                ? Object.fromEntries(
                    selectCols
                      .split(",")
                      .map((c) => c.trim())
                      .map((c) => [c, (r as Record<string, unknown>)[c]]),
                  )
                : r,
            );
          resolve({ data: shaped, error: null });
        },
      };
      return q;
    },
  };
  return client;
}

function schemaMissingClient(code: "42P01" | "42703") {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        lt() {
          return this;
        },
        limit() {
          return this;
        },
        update() {
          return this;
        },
        async then(resolve: (v: { data: null; error: unknown }) => void) {
          resolve({
            data: null,
            error: {
              code,
              message:
                code === "42P01"
                  ? 'relation "stripe_webhook_events" does not exist'
                  : 'column "state" does not exist',
            },
          });
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// mark* helpers
// ---------------------------------------------------------------------------

describe("markWebhookEventProcessing", () => {
  it("transitions pending → processing (path 1/12)", async () => {
    const c = makeClient([
      {
        id: "evt_1",
        state: "pending",
        processed_at: null,
        error: null,
        last_attempt_at: new Date().toISOString(),
      },
    ]);
    const res = await markWebhookEventProcessing(c, "evt_1");
    assert.deepEqual(res, { ok: true, updated: true });
    assert.equal(c._rows[0].state, "processing");
  });

  it("is a harmless no-op if the row is already processing (path 2/12)", async () => {
    const c = makeClient([
      {
        id: "evt_1",
        state: "processing",
        processed_at: null,
        error: null,
        last_attempt_at: new Date().toISOString(),
      },
    ]);
    const res = await markWebhookEventProcessing(c, "evt_1");
    assert.deepEqual(res, { ok: true, updated: true });
    assert.equal(c._rows[0].state, "processing");
  });

  it("is deploy-safe on 42P01 undefined_table (path 3/12)", async () => {
    const res = await markWebhookEventProcessing(
      schemaMissingClient("42P01"),
      "evt_1",
    );
    assert.deepEqual(res, {
      ok: true,
      updated: false,
      skippedReason: "schema_not_ready",
    });
  });

  it("is deploy-safe on 42703 undefined_column (path 4/12)", async () => {
    const res = await markWebhookEventProcessing(
      schemaMissingClient("42703"),
      "evt_1",
    );
    assert.deepEqual(res, {
      ok: true,
      updated: false,
      skippedReason: "schema_not_ready",
    });
  });
});

describe("markWebhookEventCompleted", () => {
  it("transitions processing → completed (path 5/12, backfill case A: processed_at NOT NULL AND error IS NULL)", async () => {
    const c = makeClient([
      {
        id: "evt_1",
        state: "processing",
        processed_at: new Date().toISOString(),
        error: null,
        last_attempt_at: new Date().toISOString(),
      },
    ]);
    const res = await markWebhookEventCompleted(c, "evt_1");
    assert.deepEqual(res, { ok: true, updated: true });
    assert.equal(c._rows[0].state, "completed");
  });

  it("is deploy-safe on 42P01 (path 6/12)", async () => {
    const res = await markWebhookEventCompleted(
      schemaMissingClient("42P01"),
      "evt_1",
    );
    assert.equal(res.ok, true);
    assert.equal(
      "skippedReason" in res ? res.skippedReason : null,
      "schema_not_ready",
    );
  });
});

describe("markWebhookEventFailed", () => {
  it("transitions processing → failed (path 7/12, backfill case B: processed_at IS NULL AND error IS NOT NULL)", async () => {
    const c = makeClient([
      {
        id: "evt_1",
        state: "processing",
        processed_at: null,
        error: "boom",
        last_attempt_at: new Date().toISOString(),
      },
    ]);
    const res = await markWebhookEventFailed(c, "evt_1");
    assert.deepEqual(res, { ok: true, updated: true });
    assert.equal(c._rows[0].state, "failed");
  });

  it("also handles backfill case C: ambiguous processed_at NOT NULL AND error NOT NULL → failed (path 8/12)", async () => {
    // Migration policy: ambiguous rows resolve to 'failed' so Stripe
    // re-delivery re-processes cleanly. This test asserts the helper
    // still writes state='failed' when the caller passes an ambiguous
    // row (the state column is what matters; legacy processed_at is
    // untouched by the helper).
    const c = makeClient([
      {
        id: "evt_1",
        state: "processing",
        processed_at: new Date().toISOString(),
        error: "post-ack crash",
        last_attempt_at: new Date().toISOString(),
      },
    ]);
    const res = await markWebhookEventFailed(c, "evt_1");
    assert.deepEqual(res, { ok: true, updated: true });
    assert.equal(c._rows[0].state, "failed");
    // Legacy columns are deliberately not touched by mark* helpers —
    // that's the route's job (`processed_at = now()`, `error = message`).
    assert.notEqual(c._rows[0].processed_at, null);
    assert.equal(c._rows[0].error, "post-ack crash");
  });

  it("is deploy-safe on 42703 (path 9/12)", async () => {
    const res = await markWebhookEventFailed(
      schemaMissingClient("42703"),
      "evt_1",
    );
    assert.equal(res.ok, true);
  });
});

// ---------------------------------------------------------------------------
// Stuck-row sweeper
// ---------------------------------------------------------------------------

describe("sweepStuckProcessingRows", () => {
  it("releases a row stuck in processing past the 5-minute threshold (path 10/12)", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const stale = new Date(now.getTime() - STUCK_THRESHOLD_MS - 1000);
    const c = makeClient([
      {
        id: "evt_stuck",
        state: "processing",
        processed_at: null,
        error: null,
        last_attempt_at: stale.toISOString(),
      },
    ]);
    const res = await sweepStuckProcessingRows(c, { now: () => now });
    assert.deepEqual(res, { ok: true, updated: true });
    assert.equal(c._rows[0].state, "failed");
    assert.equal(c._rows[0].error, "stuck_in_processing");
  });

  it("preserves an existing error string via COALESCE-equivalent (path 11/12)", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const stale = new Date(now.getTime() - STUCK_THRESHOLD_MS - 1000);
    const c = makeClient([
      {
        id: "evt_stuck2",
        state: "processing",
        processed_at: null,
        error: "half-written handler crash",
        last_attempt_at: stale.toISOString(),
      },
    ]);
    await sweepStuckProcessingRows(c, { now: () => now });
    assert.equal(c._rows[0].error, "half-written handler crash");
    assert.equal(c._rows[0].state, "failed");
  });

  it("leaves fresh processing rows and non-processing rows alone (path 12/12)", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const fresh = new Date(now.getTime() - 30 * 1000); // 30s ago
    const stale = new Date(now.getTime() - STUCK_THRESHOLD_MS - 1000);
    const c = makeClient([
      {
        id: "fresh",
        state: "processing",
        processed_at: null,
        error: null,
        last_attempt_at: fresh.toISOString(),
      },
      {
        id: "completed_stale",
        state: "completed",
        processed_at: stale.toISOString(),
        error: null,
        last_attempt_at: stale.toISOString(),
      },
      {
        id: "failed_stale",
        state: "failed",
        processed_at: null,
        error: "prior",
        last_attempt_at: stale.toISOString(),
      },
    ]);
    const res = await sweepStuckProcessingRows(c, { now: () => now });
    assert.equal(res.ok, true);
    // updated:false is fine — no rows matched the sweep predicate.
    assert.equal("updated" in res ? res.updated : null, false);
    assert.equal(c._rows[0].state, "processing"); // fresh untouched
    assert.equal(c._rows[1].state, "completed"); // completed untouched
    assert.equal(c._rows[2].state, "failed"); // failed untouched
  });

  it("is deploy-safe on 42P01", async () => {
    const res = await sweepStuckProcessingRows(schemaMissingClient("42P01"));
    assert.equal(res.ok, true);
    assert.equal(
      "skippedReason" in res ? res.skippedReason : null,
      "schema_not_ready",
    );
  });
});

// ---------------------------------------------------------------------------
// Retry-after-failure end-to-end path.
// ---------------------------------------------------------------------------

describe("retry after handler failure", () => {
  it("row moves fresh → processing → failed on crash, then processing → completed on retry", async () => {
    const c = makeClient([
      {
        id: "evt_retry",
        state: "pending",
        processed_at: null,
        error: null,
        last_attempt_at: new Date().toISOString(),
      },
    ]);
    // First delivery: claim → processing → crash → failed
    await markWebhookEventProcessing(c, "evt_retry");
    assert.equal(c._rows[0].state, "processing");
    await markWebhookEventFailed(c, "evt_retry");
    assert.equal(c._rows[0].state, "failed");
    // Stripe retries: claim (row now retryable) → processing → completed
    await markWebhookEventProcessing(c, "evt_retry");
    assert.equal(c._rows[0].state, "processing");
    await markWebhookEventCompleted(c, "evt_retry");
    assert.equal(c._rows[0].state, "completed");
  });
});
