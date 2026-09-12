import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleSubmit,
  handleVerify,
  handleCancel,
} from "./deletion-handlers";
import type { Blocker } from "./deletion-eligibility";

// ---------------------------------------------------------------------------
// A recording Supabase-shaped fake. Each `from(table)` call registers a
// chain and captures the final insert/update/select payload for
// assertion.
// ---------------------------------------------------------------------------

type Op = { verb: "insert" | "update" | "select"; table: string; payload?: unknown };

type QueueEntry = {
  match?: (op: Op) => boolean;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

function makeAdmin(queue: QueueEntry[], captured: Op[] = []) {
  return {
    __captured: captured,
    from(table: string) {
      let currentVerb: Op["verb"] = "select";
      let currentPayload: unknown;
      const settle = () => {
        const op: Op = { verb: currentVerb, table, payload: currentPayload };
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
        or: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => settle(),
        maybeSingle: () => settle(),
      };
      chain.insert = (row: unknown) => {
        currentVerb = "insert";
        currentPayload = row;
        return chain;
      };
      chain.update = (patch: unknown) => {
        currentVerb = "update";
        currentPayload = patch;
        return chain;
      };
      return chain;
    },
  };
}

const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// handleSubmit
// ---------------------------------------------------------------------------

describe("handleSubmit", () => {
  it("inserts state=submitted when eligible", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        // eligibility checks — 4 tables, all empty
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        // insert
        {
          match: (op) => op.verb === "insert",
          data: {
            id: "job-1",
            state: "submitted",
            blocker_codes: null,
            blocked_reason: null,
            requested_at: "2026-09-12T00:00:00Z",
          },
        },
      ],
      captured,
    );
    const result = await handleSubmit(
      {
        user_id: USER,
        user_email: "u@example.com",
        raw_token: "abc",
        token_hash: "hash-abc",
        now: new Date("2026-09-12T00:00:00Z"),
      },
      { admin: admin as never },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.eligibility.eligible, true);
      assert.equal(result.email_pending, true);
      assert.equal((result.job as { state: string }).state, "submitted");
    }
    const insertOp = captured.find((o) => o.verb === "insert");
    assert.ok(insertOp, "insert should have happened");
    const row = insertOp!.payload as Record<string, unknown>;
    assert.equal(row.state, "submitted");
    assert.equal(row.verification_token_hash, "hash-abc");
    assert.equal(row.blocker_codes, null);
  });

  it("inserts blocked_active_booking when eligibility flags a booking", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          match: (op) => op.verb === "insert",
          data: {
            id: "job-2",
            state: "blocked_active_booking",
            blocker_codes: ["active_booking"],
            blocked_reason: "b",
            requested_at: "x",
          },
        },
      ],
      captured,
    );
    const result = await handleSubmit(
      {
        user_id: USER,
        user_email: "u@example.com",
        raw_token: "abc",
        token_hash: "h",
        now: new Date(),
      },
      {
        admin: admin as never,
        eligibility: {
          checkActiveBooking: async () => [
            { code: "active_booking", message: "you have 1 booking" } as Blocker,
          ],
          checkActiveDispute: async () => [],
          checkOpenNotifiableEvent: async () => [],
          checkOutstandingPayout: async () => [],
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.email_pending, false);
      assert.equal(result.eligibility.eligible, false);
    }
    const insertRow = captured.find((o) => o.verb === "insert")!.payload as Record<string, unknown>;
    assert.equal(insertRow.state, "blocked_active_booking");
    assert.deepEqual(insertRow.blocker_codes, ["active_booking"]);
  });

  it("returns schema_not_ready when insert hits 42P01", async () => {
    const admin = makeAdmin([
      {
        match: (op) => op.verb === "insert",
        error: { code: "42P01", message: "relation does not exist" },
      },
    ]);
    const result = await handleSubmit(
      {
        user_id: USER,
        user_email: "u@example.com",
        raw_token: "abc",
        token_hash: "h",
        now: new Date(),
      },
      {
        admin: admin as never,
        eligibility: {
          checkActiveBooking: async () => [],
          checkActiveDispute: async () => [],
          checkOpenNotifiableEvent: async () => [],
          checkOutstandingPayout: async () => [],
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "schema_not_ready");
  });
});

// ---------------------------------------------------------------------------
// handleVerify
// ---------------------------------------------------------------------------

describe("handleVerify", () => {
  it("flips submitted → in_progress when eligible", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        // maybeSingle lookup
        {
          data: {
            id: "job-1",
            user_id: USER,
            state: "submitted",
            verification_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
            cancelled_at: null,
            verified_at: null,
          },
        },
        // update
        {
          match: (op) => op.verb === "update",
          data: {
            id: "job-1",
            state: "in_progress",
            blocker_codes: null,
            blocked_reason: null,
            verified_at: "x",
          },
        },
      ],
      captured,
    );
    const result = await handleVerify(
      { user_id: USER, token_hash: "hash-abcdef", now: new Date() },
      {
        admin: admin as never,
        eligibility: {
          checkActiveBooking: async () => [],
          checkActiveDispute: async () => [],
          checkOpenNotifiableEvent: async () => [],
          checkOutstandingPayout: async () => [],
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal((result.job as { state: string }).state, "in_progress");
    const updateOp = captured.find((o) => o.verb === "update")!;
    const patch = updateOp.payload as Record<string, unknown>;
    assert.equal(patch.state, "in_progress");
    assert.ok(String(patch.verification_token_hash).startsWith("consumed:"));
  });

  it("returns token_not_found for someone else's job id", async () => {
    const admin = makeAdmin([
      {
        data: {
          id: "job-x",
          user_id: "other-user",
          state: "submitted",
          verification_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    ]);
    const result = await handleVerify(
      { user_id: USER, token_hash: "h", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "token_not_found");
  });

  it("returns token_expired when past TTL", async () => {
    const admin = makeAdmin([
      {
        data: {
          id: "job-e",
          user_id: USER,
          state: "submitted",
          verification_token_expires_at: new Date(Date.now() - 1000).toISOString(),
        },
      },
    ]);
    const result = await handleVerify(
      { user_id: USER, token_hash: "h", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "token_expired");
  });

  it("is idempotent on a job already in_progress", async () => {
    const admin = makeAdmin([
      {
        data: {
          id: "job-i",
          user_id: USER,
          state: "in_progress",
          verification_token_expires_at: new Date().toISOString(),
        },
      },
    ]);
    const result = await handleVerify(
      { user_id: USER, token_hash: "h", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.idempotent, true);
  });

  it("blocks on regressed eligibility during the verify window", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        {
          data: {
            id: "job-b",
            user_id: USER,
            state: "submitted",
            verification_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        },
        {
          match: (op) => op.verb === "update",
          data: {
            id: "job-b",
            state: "blocked_active_dispute",
            blocker_codes: ["active_dispute"],
            blocked_reason: "d",
            verified_at: "x",
          },
        },
      ],
      captured,
    );
    const result = await handleVerify(
      { user_id: USER, token_hash: "h", now: new Date() },
      {
        admin: admin as never,
        eligibility: {
          checkActiveBooking: async () => [],
          checkActiveDispute: async () => [
            { code: "active_dispute", message: "d" } as Blocker,
          ],
          checkOpenNotifiableEvent: async () => [],
          checkOutstandingPayout: async () => [],
        },
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.eligibility.eligible, false);
      assert.equal((result.job as { state: string }).state, "blocked_active_dispute");
    }
  });
});

// ---------------------------------------------------------------------------
// handleCancel
// ---------------------------------------------------------------------------

describe("handleCancel", () => {
  it("cancels a job in state=submitted", async () => {
    const captured: Op[] = [];
    const admin = makeAdmin(
      [
        { data: { id: "job-c", user_id: USER, state: "submitted" } },
        {
          match: (op) => op.verb === "update",
          data: { id: "job-c", state: "cancelled", cancelled_at: "x" },
        },
      ],
      captured,
    );
    const result = await handleCancel(
      { user_id: USER, job_id: "job-c", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal((result.job as { state: string }).state, "cancelled");
  });

  it("refuses to cancel someone else's job", async () => {
    const admin = makeAdmin([
      { data: { id: "job-x", user_id: "other", state: "submitted" } },
    ]);
    const result = await handleCancel(
      { user_id: USER, job_id: "job-x", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "forbidden");
  });

  it("refuses when state is in_progress", async () => {
    const admin = makeAdmin([
      { data: { id: "job-p", user_id: USER, state: "in_progress" } },
    ]);
    const result = await handleCancel(
      { user_id: USER, job_id: "job-p", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "not_cancellable");
      assert.equal(result.state, "in_progress");
    }
  });

  it("returns job_not_found when no row", async () => {
    const admin = makeAdmin([{ data: null }]);
    const result = await handleCancel(
      { user_id: USER, job_id: "missing", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "job_not_found");
  });

  it("returns schema_not_ready when table missing", async () => {
    const admin = makeAdmin([
      { error: { code: "42P01", message: "relation does not exist" } },
    ]);
    const result = await handleCancel(
      { user_id: USER, job_id: "missing", now: new Date() },
      { admin: admin as never },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "schema_not_ready");
  });
});
