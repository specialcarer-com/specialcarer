import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runDeletionWorker,
  DELETION_WORKER_CONSTANTS,
  type EraseResult,
  type WorkerAdminClient,
} from "./deletion-worker";
import type { Blocker } from "./deletion-eligibility";

// ---------------------------------------------------------------------------
// Fake admin client — records every operation and returns queued
// responses in order. The dsar_requests + account_deletion_jobs
// operations from the worker are the ones tests care about; everything
// else (eligibility SELECTs on bookings / disputes / etc.) is fed
// through the same queue.
// ---------------------------------------------------------------------------

type Op = {
  verb: "select" | "insert" | "update";
  table: string;
  payload?: unknown;
};

type QueueEntry = {
  match?: (op: Op) => boolean;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

function makeAdmin(queue: QueueEntry[], captured: Op[] = []): WorkerAdminClient {
  return {
    from(table: string) {
      let verb: Op["verb"] = "select";
      let payload: unknown;
      const settle = () => {
        const op: Op = { verb, table, payload };
        captured.push(op);
        for (let i = 0; i < queue.length; i++) {
          const q = queue[i];
          if (!q.match || q.match(op)) {
            queue.splice(i, 1);
            return Promise.resolve({ data: q.data ?? null, error: q.error ?? null });
          }
        }
        return Promise.resolve({ data: null, error: null });
      };
      const chain: Record<string, unknown> = {
        then: (fn: (v: unknown) => unknown) => settle().then(fn),
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        is: () => chain,
        lte: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => settle(),
        maybeSingle: () => settle(),
      };
      chain.insert = (row: unknown) => {
        verb = "insert";
        payload = row;
        return chain;
      };
      chain.update = (patch: unknown) => {
        verb = "update";
        payload = patch;
        return chain;
      };
      return chain;
    },
  };
}

const USER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function eligibilityQueue(): QueueEntry[] {
  // 4 empty responses for the 4 blocker checks + orchestrator uses .then
  return [
    { data: [] },
    { data: [] },
    { data: [] },
    { data: [] },
  ];
}

// ---------------------------------------------------------------------------

describe("runDeletionWorker", () => {
  it("processes an in_progress row end-to-end (complete + email)", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        // fresh batch
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [
            {
              id: "job-1",
              user_id: USER,
              requested_at: "2026-09-12T00:00:00Z",
              state: "in_progress",
              retry_count: 0,
              resume_after: null,
            },
          ],
        },
        // retry batch (empty)
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [],
        },
        // 4 eligibility SELECTs
        ...eligibilityQueue(),
        // bridge insert into dsar_requests
        {
          match: (op) => op.table === "dsar_requests" && op.verb === "insert",
          data: { id: "dsar-req-1" },
        },
        // final job update
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "update",
          data: null,
        },
      ],
      captured,
    );

    const sent: unknown[] = [];
    const runErase = async (): Promise<EraseResult> => ({
      ok: true,
      audit: [
        {
          action: "null",
          table_name: "profiles",
          column_name: "email",
          row_count: 1,
          reason: null,
          retained_until: null,
        },
        {
          action: "retain",
          table_name: "invoices",
          column_name: null,
          row_count: 3,
          reason: "HMRC 6yr",
          retained_until: "2032-09-12",
        },
      ],
      deferred: [],
      audit_persist_error: null,
      deferred_persist_error: null,
      request_persist_error: null,
      digest: "abcd1234efgh5678",
      version: "dsar-erase/1.0.0",
    });

    const result = await runDeletionWorker({
      admin,
      runErase,
      sendCompletionEmail: async (args) => {
        sent.push(args);
      },
      lookupUserEmail: async () => "u@example.com",
    });

    assert.equal(result.ok, true);
    assert.equal(result.processed, 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].outcome, "complete");
    assert.equal(result.results[0].detail, "abcd1234efgh5678");
    assert.equal(sent.length, 1);
    const patch = captured.find(
      (o) => o.table === "account_deletion_jobs" && o.verb === "update",
    )!.payload as Record<string, unknown>;
    assert.equal(patch.state, "complete");
    assert.equal(patch.manifest_version, "dsar-erase/1.0.0");
    assert.equal(patch.audit_digest, "abcd1234efgh5678");
    assert.ok(patch.completed_at);
  });

  it("transitions to blocked_* when re-checked eligibility fails", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [
            {
              id: "job-2",
              user_id: USER,
              requested_at: "x",
              state: "in_progress",
              retry_count: 0,
              resume_after: null,
            },
          ],
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [],
        },
        // eligibility with a booking
        ...eligibilityQueue(),
        // update
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "update",
        },
      ],
      captured,
    );

    let eraseCalled = false;
    const result = await runDeletionWorker({
      admin,
      runErase: async () => {
        eraseCalled = true;
        throw new Error("should not be called");
      },
      sendCompletionEmail: async () => {},
      lookupUserEmail: async () => "u@example.com",
      eligibility: {
        checkActiveBooking: async () => [
          { code: "active_booking", message: "b" } as Blocker,
        ],
        checkActiveDispute: async () => [],
        checkOpenNotifiableEvent: async () => [],
        checkOutstandingPayout: async () => [],
      },
    });

    assert.equal(result.results[0].outcome, "blocked");
    assert.equal(eraseCalled, false);
    const patch = captured.find(
      (o) => o.table === "account_deletion_jobs" && o.verb === "update",
    )!.payload as Record<string, unknown>;
    assert.equal(patch.state, "blocked_active_booking");
    assert.deepEqual(patch.blocker_codes, ["active_booking"]);
  });

  it("defers on erase throw with retry_count+1 and future resume_after", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [
            {
              id: "job-3",
              user_id: USER,
              requested_at: "x",
              state: "in_progress",
              retry_count: 1,
              resume_after: null,
            },
          ],
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [],
        },
        ...eligibilityQueue(),
        {
          match: (op) => op.table === "dsar_requests" && op.verb === "insert",
          data: { id: "dsar-req-3" },
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "update",
        },
      ],
      captured,
    );

    const result = await runDeletionWorker({
      admin,
      runErase: async () => {
        throw new Error("transient DB blip");
      },
      sendCompletionEmail: async () => {},
      lookupUserEmail: async () => "u@example.com",
    });
    assert.equal(result.results[0].outcome, "erase_error");
    const patch = captured.find(
      (o) => o.table === "account_deletion_jobs" && o.verb === "update",
    )!.payload as Record<string, unknown>;
    assert.equal(patch.state, "deferred");
    assert.equal(patch.retry_count, 2);
    assert.ok(patch.resume_after);
    assert.match(String(patch.blocked_reason ?? ""), /transient DB blip/);
  });

  it("terminates when retry_count hits MAX_RETRIES on erase throw", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [
            {
              id: "job-4",
              user_id: USER,
              requested_at: "x",
              state: "deferred",
              retry_count: DELETION_WORKER_CONSTANTS.MAX_RETRIES - 1,
              resume_after: null,
            },
          ],
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [],
        },
        ...eligibilityQueue(),
        {
          match: (op) => op.table === "dsar_requests" && op.verb === "insert",
          data: { id: "dsar-req-4" },
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "update",
        },
      ],
      captured,
    );
    const result = await runDeletionWorker({
      admin,
      runErase: async () => {
        throw new Error("permanent failure");
      },
      sendCompletionEmail: async () => {},
      lookupUserEmail: async () => "u@example.com",
    });
    assert.equal(result.results[0].outcome, "max_retries_exhausted");
    const patch = captured.find(
      (o) => o.table === "account_deletion_jobs" && o.verb === "update",
    )!.payload as Record<string, unknown>;
    assert.equal(patch.state, "deferred");
    assert.equal(patch.resume_after, null); // no further retries scheduled
    assert.match(String(patch.blocked_reason), /^max_retries_exhausted:/);
  });

  it("defers when erase returns deferred rows or persist errors", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [
            {
              id: "job-5",
              user_id: USER,
              requested_at: "x",
              state: "in_progress",
              retry_count: 0,
              resume_after: null,
            },
          ],
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [],
        },
        ...eligibilityQueue(),
        {
          match: (op) => op.table === "dsar_requests" && op.verb === "insert",
          data: { id: "dsar-req-5" },
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "update",
        },
      ],
      captured,
    );
    const result = await runDeletionWorker({
      admin,
      runErase: async () => ({
        ok: true,
        audit: [],
        deferred: [{ some_table: "reference_requests" }],
        audit_persist_error: null,
        deferred_persist_error: null,
        request_persist_error: null,
        digest: "0",
        version: "dsar-erase/1.0.0",
      }),
      sendCompletionEmail: async () => {},
      lookupUserEmail: async () => "u@example.com",
    });
    assert.equal(result.results[0].outcome, "deferred");
    const patch = captured.find(
      (o) => o.table === "account_deletion_jobs" && o.verb === "update",
    )!.payload as Record<string, unknown>;
    assert.equal(patch.state, "deferred");
    assert.equal(patch.retry_count, 1);
    assert.match(String(patch.blocked_reason), /deferred_rows:1/);
  });

  it("returns schema_not_ready when the queue table is missing", async () => {
    const admin = makeAdmin([
      {
        match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
        error: { code: "42P01", message: "relation does not exist" },
      },
    ]);
    const result = await runDeletionWorker({
      admin,
      runErase: async () => {
        throw new Error("unreachable");
      },
      sendCompletionEmail: async () => {},
      lookupUserEmail: async () => "u@example.com",
    });
    assert.equal(result.processed, 0);
    assert.equal(result.skipped, "schema_not_ready");
  });

  it("defers when the user has no email (auth.users gone)", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [
            {
              id: "job-6",
              user_id: USER,
              requested_at: "x",
              state: "in_progress",
              retry_count: 0,
              resume_after: null,
            },
          ],
        },
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "select",
          data: [],
        },
        ...eligibilityQueue(),
        {
          match: (op) => op.table === "account_deletion_jobs" && op.verb === "update",
        },
      ],
      captured,
    );
    const result = await runDeletionWorker({
      admin,
      runErase: async () => {
        throw new Error("unreachable");
      },
      sendCompletionEmail: async () => {},
      lookupUserEmail: async () => null,
    });
    assert.equal(result.results[0].outcome, "no_email");
    const patch = captured.find(
      (o) => o.table === "account_deletion_jobs" && o.verb === "update",
    )!.payload as Record<string, unknown>;
    assert.equal(patch.state, "deferred");
    assert.equal(patch.retry_count, 1);
  });
});
