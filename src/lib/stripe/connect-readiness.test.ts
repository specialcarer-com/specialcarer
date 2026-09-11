import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONNECT_CACHE_TTL_MS,
  accountToRow,
  assertConnectReadyForBooking,
  evaluateReadiness,
  friendlyReasonMessage,
  isCacheStale,
  parseIsoMs,
  type ConnectAccountRow,
  type ReadinessDeps,
} from "./connect-readiness";

/** Build a healthy row. Callers override to test each reason branch. */
function makeRow(over: Partial<ConnectAccountRow> = {}): ConnectAccountRow {
  return {
    stripe_account_id: "acct_test",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    capabilities: { transfers: { status: "active" } },
    disabled_reason: null,
    last_refreshed_at: new Date().toISOString(),
    ...over,
  };
}

// Minimal Supabase query builder mock. Every step returns `this` and
// `maybeSingle` resolves to the configured result. `update().eq()` is a
// spyable no-op that records the payload.
function mockAdmin(opts: {
  row: ConnectAccountRow | null;
  error?: { message: string } | null;
  updates?: unknown[];
}) {
  const updates: unknown[] = opts.updates ?? [];
  const build = () => {
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      async maybeSingle() {
        return { data: opts.row, error: opts.error ?? null };
      },
      update(payload: unknown) {
        updates.push(payload);
        return {
          async eq() {
            return { data: null, error: null };
          },
        };
      },
    };
    return builder;
  };
  return {
    admin: { from: () => build() as unknown as ReturnType<typeof build> },
    updates,
  };
}

function mockStripe(retrieveResult: unknown | Error) {
  const calls: string[] = [];
  return {
    calls,
    stripe: {
      accounts: {
        async retrieve(id: string) {
          calls.push(id);
          if (retrieveResult instanceof Error) throw retrieveResult;
          return retrieveResult as never;
        },
      },
    },
  };
}

// ─── Pure evaluator ──────────────────────────────────────────────────────────

describe("evaluateReadiness — reason matrix", () => {
  it("returns ready:true when every check passes", () => {
    assert.deepEqual(evaluateReadiness(makeRow()), { ready: true });
  });

  it("account_restricted wins when disabled_reason is set even if flags look fine", () => {
    const result = evaluateReadiness(
      makeRow({
        disabled_reason: "requirements.past_due",
        charges_enabled: true,
        payouts_enabled: true,
      }),
    );
    assert.deepEqual(result, {
      ready: false,
      reason: "account_restricted",
      disabled_reason: "requirements.past_due",
    });
  });

  it("account_restricted also wins when flags are already false", () => {
    const result = evaluateReadiness(
      makeRow({
        disabled_reason: "rejected.fraud",
        charges_enabled: false,
        payouts_enabled: false,
      }),
    );
    assert.equal(
      (result as { reason: string }).reason,
      "account_restricted",
      "disabled_reason must have highest priority",
    );
  });

  it("legacy_incomplete when never-refreshed + no details + no capabilities", () => {
    const result = evaluateReadiness(
      makeRow({
        last_refreshed_at: null,
        details_submitted: false,
        capabilities: {},
        charges_enabled: false,
        payouts_enabled: false,
      }),
    );
    assert.deepEqual(result, { ready: false, reason: "legacy_incomplete" });
  });

  it("charges_disabled beats payouts_disabled and transfers_capability_missing", () => {
    const result = evaluateReadiness(
      makeRow({
        charges_enabled: false,
        payouts_enabled: false,
        capabilities: { transfers: { status: "inactive" } },
      }),
    );
    assert.deepEqual(result, { ready: false, reason: "charges_disabled" });
  });

  it("payouts_disabled beats transfers_capability_missing", () => {
    const result = evaluateReadiness(
      makeRow({
        payouts_enabled: false,
        capabilities: { transfers: { status: "inactive" } },
      }),
    );
    assert.deepEqual(result, { ready: false, reason: "payouts_disabled" });
  });

  it("transfers_capability_missing when only that capability is not active", () => {
    const result = evaluateReadiness(
      makeRow({ capabilities: { transfers: { status: "pending" } } }),
    );
    assert.deepEqual(result, {
      ready: false,
      reason: "transfers_capability_missing",
    });
  });

  it("transfers_capability_missing when we have refreshed but Stripe never surfaced a transfers cap", () => {
    const result = evaluateReadiness(
      makeRow({
        capabilities: { card_payments: { status: "active" } },
      }),
    );
    assert.deepEqual(result, {
      ready: false,
      reason: "transfers_capability_missing",
    });
  });

  it("does NOT flag transfers_capability_missing when we've never refreshed and flags look fine (avoids false positives on fresh migration)", () => {
    const result = evaluateReadiness(
      makeRow({
        last_refreshed_at: null,
        capabilities: {},
      }),
    );
    assert.deepEqual(result, { ready: true });
  });
});

// ─── Freshness helpers ───────────────────────────────────────────────────────

describe("parseIsoMs", () => {
  it("returns 0 for null so an unknown row is always stale", () => {
    assert.equal(parseIsoMs(null), 0);
  });
  it("returns 0 for garbage", () => {
    assert.equal(parseIsoMs("not a date"), 0);
  });
  it("parses ISO", () => {
    assert.equal(
      parseIsoMs("2026-09-11T22:00:00Z"),
      Date.parse("2026-09-11T22:00:00Z"),
    );
  });
});

describe("isCacheStale", () => {
  const now = Date.parse("2026-09-11T22:00:00Z");

  it("stale when last_refreshed_at is null", () => {
    assert.equal(isCacheStale({ last_refreshed_at: null }, now), true);
  });

  it("fresh at 59 minutes", () => {
    const iso = new Date(now - 59 * 60 * 1000).toISOString();
    assert.equal(isCacheStale({ last_refreshed_at: iso }, now), false);
  });

  it("stale strictly greater than 60 minutes", () => {
    const iso = new Date(now - CONNECT_CACHE_TTL_MS - 1).toISOString();
    assert.equal(isCacheStale({ last_refreshed_at: iso }, now), true);
  });

  it("fresh at exactly 60 minutes (boundary)", () => {
    const iso = new Date(now - CONNECT_CACHE_TTL_MS).toISOString();
    assert.equal(isCacheStale({ last_refreshed_at: iso }, now), false);
  });
});

// ─── accountToRow — Stripe.Account → row shape ───────────────────────────────

describe("accountToRow", () => {
  it("copies every readiness-relevant field, coerces booleans, and stamps last_refreshed_at", () => {
    const nowIso = "2026-09-11T22:30:00Z";
    const row = accountToRow(
      {
        charges_enabled: true,
        payouts_enabled: false,
        details_submitted: true,
        capabilities: { transfers: { status: "active" } },
        requirements: {
          disabled_reason: "requirements.past_due",
          currently_due: ["individual.first_name"],
        },
      } as never,
      nowIso,
    );
    assert.deepEqual(row, {
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
      capabilities: { transfers: { status: "active" } },
      disabled_reason: "requirements.past_due",
      last_refreshed_at: nowIso,
      requirements_currently_due: ["individual.first_name"],
    });
  });

  it("defaults capabilities to {} and currently_due to [] when absent", () => {
    const row = accountToRow(
      {
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: {},
      } as never,
      "2026-09-11T22:30:00Z",
    );
    assert.deepEqual(row.capabilities, {});
    assert.deepEqual(row.requirements_currently_due, []);
    assert.equal(row.disabled_reason, null);
  });
});

// ─── friendlyReasonMessage — total function, no Stripe jargon ────────────────

describe("friendlyReasonMessage", () => {
  const cases: Array<[
    Parameters<typeof friendlyReasonMessage>[0],
    string,
  ]> = [
    ["account_restricted", "temporarily unable"],
    ["charges_disabled", "hasn't finished setting up"],
    ["payouts_disabled", "payout details need attention"],
    ["transfers_capability_missing", "temporarily unable"],
    ["legacy_incomplete", "hasn't finished setting up"],
  ];
  for (const [reason, needle] of cases) {
    it(`returns a friendly, jargon-free message for ${reason}`, () => {
      const msg = friendlyReasonMessage(reason);
      assert.match(msg, new RegExp(needle));
      assert.doesNotMatch(msg, /stripe/i, "must not name Stripe");
      assert.doesNotMatch(msg, /capabilit/i, "must not leak jargon");
    });
  }
});

// ─── assertConnectReadyForBooking — the whole gate ───────────────────────────

describe("assertConnectReadyForBooking", () => {
  const now = new Date("2026-09-11T22:00:00Z");
  const deps = (over: Partial<ReadinessDeps>): ReadinessDeps => ({
    now: () => now,
    ...over,
  } as ReadinessDeps);

  it("returns legacy_incomplete when the carer has never onboarded", async () => {
    const { admin } = mockAdmin({ row: null });
    const { stripe, calls } = mockStripe(new Error("should not be called"));
    const out = await assertConnectReadyForBooking(
      deps({ admin, stripe }),
      { carerId: "user_1" },
    );
    assert.deepEqual(out, { ready: false, reason: "legacy_incomplete" });
    assert.equal(calls.length, 0, "no Stripe read for missing row");
  });

  it("fails closed as charges_disabled when the cache read errors", async () => {
    const { admin } = mockAdmin({
      row: null,
      error: { message: "db down" },
    });
    const { stripe } = mockStripe(new Error("should not be called"));
    const out = await assertConnectReadyForBooking(
      deps({ admin, stripe }),
      { carerId: "user_1" },
    );
    assert.deepEqual(out, { ready: false, reason: "charges_disabled" });
  });

  it("serves local when the cache is fresh — no Stripe roundtrip", async () => {
    // Row was refreshed 10 min before `now` — well inside the 60-min TTL.
    const freshIso = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const { admin } = mockAdmin({
      row: makeRow({ last_refreshed_at: freshIso }),
    });
    const { stripe, calls } = mockStripe(new Error("should not be called"));
    const out = await assertConnectReadyForBooking(
      deps({ admin, stripe }),
      { carerId: "user_1" },
    );
    assert.deepEqual(out, { ready: true });
    assert.equal(calls.length, 0, "fresh cache must not hit Stripe");
  });

  it("refreshes from Stripe on stale, writes back, returns fresh eval", async () => {
    const staleIso = new Date(
      now.getTime() - CONNECT_CACHE_TTL_MS - 1,
    ).toISOString();
    const updates: unknown[] = [];
    const { admin } = mockAdmin({
      row: makeRow({
        last_refreshed_at: staleIso,
        capabilities: { transfers: { status: "pending" } },
      }),
      updates,
    });
    const { stripe, calls } = mockStripe({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      capabilities: { transfers: { status: "active" } },
      requirements: { currently_due: [] },
    });
    const out = await assertConnectReadyForBooking(
      deps({ admin, stripe }),
      { carerId: "user_1" },
    );
    assert.deepEqual(out, { ready: true });
    assert.deepEqual(calls, ["acct_test"], "one live Stripe read");
    assert.equal(updates.length, 1, "cache written back");
    const payload = updates[0] as Record<string, unknown>;
    assert.equal(payload.charges_enabled, true);
    assert.deepEqual(payload.capabilities, {
      transfers: { status: "active" },
    });
    assert.equal(payload.disabled_reason, null);
    assert.ok(typeof payload.last_refreshed_at === "string");
  });

  it("degrades gracefully when the stale refresh fails — evaluates against cached row", async () => {
    const staleIso = new Date(
      now.getTime() - CONNECT_CACHE_TTL_MS - 1,
    ).toISOString();
    const { admin } = mockAdmin({
      row: makeRow({
        last_refreshed_at: staleIso,
        charges_enabled: false,
      }),
    });
    const { stripe } = mockStripe(new Error("stripe boom"));
    const out = await assertConnectReadyForBooking(
      deps({ admin, stripe }),
      { carerId: "user_1" },
    );
    // Uses whatever we had cached — which was not ready.
    assert.deepEqual(out, { ready: false, reason: "charges_disabled" });
  });
});
