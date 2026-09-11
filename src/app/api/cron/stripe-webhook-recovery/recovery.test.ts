import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STALE_AFTER_MS,
  classifyReplay,
  recoverStripeWebhooks,
  type RecoveryClient,
  type StuckEvent,
} from "./recovery";

function stub(overrides: Partial<RecoveryClient> = {}): RecoveryClient {
  return {
    async findStuck() {
      return { events: [], error: null };
    },
    async replay() {
      return { status: 200, body: { received: true } };
    },
    ...overrides,
  };
}

function stuck(overrides: Partial<StuckEvent> = {}): StuckEvent {
  return {
    id: "evt_test",
    type: "payment_intent.succeeded",
    payload: { id: "evt_test" },
    attemptCount: 2,
    ageMs: 30 * 60 * 1000,
    ...overrides,
  };
}

describe("recoverStripeWebhooks — orchestrator", () => {
  it("returns 500 when findStuck errors", async () => {
    const res = await recoverStripeWebhooks(
      stub({
        async findStuck() {
          return { events: [], error: "db_broken" };
        },
      }),
    );
    assert.deepEqual(res, { status: 500, body: { ok: false, error: "db_broken" } });
  });

  it("returns a clean zero summary when nothing is stuck", async () => {
    const res = await recoverStripeWebhooks(stub());
    assert.equal(res.status, 200);
    if (!res.body.ok) throw new Error();
    assert.deepEqual(res.body, {
      ok: true,
      scanned: 0,
      recovered: 0,
      still_failing: 0,
      poisoned: 0,
      errors: 0,
      outcomes: [],
    });
  });

  it("forwards default staleAfterMs, maxAttempts, and batchSize when not overridden", async () => {
    let seen = { staleAfterMs: -1, maxAttempts: -1, limit: -1 };
    await recoverStripeWebhooks(
      stub({
        async findStuck(input) {
          seen = input;
          return { events: [], error: null };
        },
      }),
    );
    assert.equal(seen.staleAfterMs, DEFAULT_STALE_AFTER_MS);
    assert.equal(seen.maxAttempts, DEFAULT_MAX_ATTEMPTS);
    assert.equal(seen.limit, DEFAULT_BATCH_SIZE);
  });

  it("forwards overrides to findStuck", async () => {
    let seen = { staleAfterMs: -1, maxAttempts: -1, limit: -1 };
    await recoverStripeWebhooks(
      stub({
        async findStuck(input) {
          seen = input;
          return { events: [], error: null };
        },
      }),
      { staleAfterMs: 60_000, maxAttempts: 3, batchSize: 5 },
    );
    assert.deepEqual(seen, { staleAfterMs: 60_000, maxAttempts: 3, limit: 5 });
  });

  it("aggregates counts across mixed replay outcomes", async () => {
    let call = 0;
    const res = await recoverStripeWebhooks(
      stub({
        async findStuck() {
          return {
            events: [
              stuck({ id: "evt_a" }),
              stuck({ id: "evt_b" }),
              stuck({ id: "evt_c" }),
              stuck({ id: "evt_d" }),
            ],
            error: null,
          };
        },
        async replay() {
          call++;
          if (call === 1) return { status: 200, body: { received: true } };
          if (call === 2) return { status: 200, body: { poisoned: true } };
          if (call === 3) return { status: 500, body: { error: "handler_boom" } };
          return { status: 0, body: {}, networkError: "econnreset" };
        },
      }),
    );
    assert.equal(res.status, 200);
    if (!res.body.ok) throw new Error();
    assert.equal(res.body.scanned, 4);
    assert.equal(res.body.recovered, 1);
    assert.equal(res.body.poisoned, 1);
    assert.equal(res.body.still_failing, 1);
    assert.equal(res.body.errors, 1);
  });
});

describe("classifyReplay — single-event branches", () => {
  it("network error → error", async () => {
    const out = await classifyReplay(
      stub({
        async replay() {
          return { status: 0, body: {}, networkError: "econnrefused" };
        },
      }),
      stuck(),
    );
    assert.deepEqual(out, { kind: "error", eventId: "evt_test", error: "econnrefused" });
  });

  it("200 with received:true → recovered", async () => {
    const out = await classifyReplay(
      stub({
        async replay() {
          return { status: 200, body: { received: true } };
        },
      }),
      stuck(),
    );
    assert.equal(out.kind, "recovered");
  });

  it("200 with idempotent:true → recovered (another delivery already fixed it)", async () => {
    const out = await classifyReplay(
      stub({
        async replay() {
          return { status: 200, body: { received: true, idempotent: true } };
        },
      }),
      stuck(),
    );
    assert.equal(out.kind, "recovered");
  });

  it("200 with poisoned:true → poisoned", async () => {
    const out = await classifyReplay(
      stub({
        async replay() {
          return { status: 200, body: { received: true, poisoned: true } };
        },
      }),
      stuck(),
    );
    assert.equal(out.kind, "poisoned");
  });

  it("500 with an error → still_failing (carries reason)", async () => {
    const out = await classifyReplay(
      stub({
        async replay() {
          return { status: 500, body: { error: "supabase_5xx" } };
        },
      }),
      stuck(),
    );
    assert.equal(out.kind, "still_failing");
    if (out.kind === "still_failing") assert.equal(out.reason, "supabase_5xx");
  });

  it("500 without an error → still_failing (synthesises http_500)", async () => {
    const out = await classifyReplay(
      stub({
        async replay() {
          return { status: 500, body: {} };
        },
      }),
      stuck(),
    );
    if (out.kind !== "still_failing") throw new Error();
    assert.equal(out.reason, "http_500");
  });
});
