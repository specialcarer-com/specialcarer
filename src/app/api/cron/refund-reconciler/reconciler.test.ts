/**
 * Unit tests for the refund reconciler. We drive it through a stub
 * client so the entire matrix (Stripe missing / succeeded / failed /
 * canceled / pending / requires_action, plus DB failures on both the
 * complete and fail paths, plus the give-up window) is covered without
 * hitting Supabase or Stripe.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GIVE_UP_AFTER_MS,
  DEFAULT_STALE_AFTER_MS,
  reconcileStuckRefunds,
  resolveClaim,
  type ReconcilerClient,
  type StripeRefundView,
  type StuckClaim,
} from "./reconciler";

function stubClient(overrides: Partial<ReconcilerClient> = {}): ReconcilerClient {
  return {
    async findStuck() {
      return { claims: [], error: null };
    },
    async findStripeRefundByKey() {
      return { refund: null, error: null };
    },
    async markCompleted() {
      return { error: null };
    },
    async markFailed() {
      return { error: null };
    },
    ...overrides,
  };
}

function refund(status: StripeRefundView["status"], extra?: Partial<StripeRefundView>): StripeRefundView {
  return {
    id: "re_test",
    status,
    amountCents: 5000,
    paymentIntentId: "pi_test",
    createdAt: "2026-09-11T12:00:00.000Z",
    ...extra,
  };
}

function claim(overrides?: Partial<StuckClaim>): StuckClaim {
  return {
    bookingId: "bk_test",
    refundRequestKey: "refund-bk_test-admin-5000",
    refundStatus: "pending_stripe",
    ageMs: 15 * 60 * 1000,
    ...overrides,
  };
}

describe("reconcileStuckRefunds — orchestrator", () => {
  it("returns 500 when findStuck errors", async () => {
    const client = stubClient({
      async findStuck() {
        return { claims: [], error: "db_broken" };
      },
    });
    const res = await reconcileStuckRefunds(client);
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, error: "db_broken" });
  });

  it("returns a clean zero-summary when nothing is stuck", async () => {
    const client = stubClient();
    const res = await reconcileStuckRefunds(client);
    assert.equal(res.status, 200);
    if (!res.body.ok) throw new Error("expected ok body");
    assert.deepEqual(res.body, {
      ok: true,
      scanned: 0,
      completed: 0,
      failed: 0,
      still_pending: 0,
      errors: 0,
      outcomes: [],
    });
  });

  it("aggregates counts across mixed outcomes", async () => {
    let call = 0;
    const client = stubClient({
      async findStuck() {
        return {
          claims: [claim({ bookingId: "bk_a" }), claim({ bookingId: "bk_b" }), claim({ bookingId: "bk_c" })],
          error: null,
        };
      },
      async findStripeRefundByKey() {
        call++;
        if (call === 1) return { refund: refund("succeeded"), error: null };
        if (call === 2) return { refund: refund("failed", { failureReason: "card_declined" }), error: null };
        return { refund: refund("pending"), error: null };
      },
    });
    const res = await reconcileStuckRefunds(client);
    assert.equal(res.status, 200);
    if (!res.body.ok) throw new Error();
    assert.equal(res.body.scanned, 3);
    assert.equal(res.body.completed, 1);
    assert.equal(res.body.failed, 1);
    assert.equal(res.body.still_pending, 1);
    assert.equal(res.body.errors, 0);
  });

  it("respects a custom staleAfterMs by forwarding it to findStuck", async () => {
    let requested = -1;
    const client = stubClient({
      async findStuck(ms) {
        requested = ms;
        return { claims: [], error: null };
      },
    });
    await reconcileStuckRefunds(client, { staleAfterMs: 60_000 });
    assert.equal(requested, 60_000);
  });

  it("defaults staleAfterMs to DEFAULT_STALE_AFTER_MS", async () => {
    let requested = -1;
    const client = stubClient({
      async findStuck(ms) {
        requested = ms;
        return { claims: [], error: null };
      },
    });
    await reconcileStuckRefunds(client);
    assert.equal(requested, DEFAULT_STALE_AFTER_MS);
  });
});

describe("resolveClaim — single-claim behaviour", () => {
  it("returns error when Stripe lookup errors", async () => {
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: null, error: "stripe_5xx" };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.deepEqual(out, { bookingId: "bk_test", kind: "error", error: "stripe_5xx" });
  });

  it("keeps claim pending when Stripe has no refund yet and we're inside the give-up window", async () => {
    const client = stubClient();
    const out = await resolveClaim(
      client,
      claim({ ageMs: 30 * 60 * 1000 }),
      DEFAULT_GIVE_UP_AFTER_MS,
    );
    assert.deepEqual(out, {
      bookingId: "bk_test",
      kind: "still_pending",
      reason: "no_stripe_refund_yet",
    });
  });

  it("marks failed_permanent when Stripe has no refund and give-up window has passed", async () => {
    let called = false;
    const client = stubClient({
      async markFailed(input) {
        called = true;
        assert.equal(input.reason, "no_stripe_refund_after_give_up_window");
        return { error: null };
      },
    });
    const out = await resolveClaim(
      client,
      claim({ ageMs: 25 * 60 * 60 * 1000 }),
      DEFAULT_GIVE_UP_AFTER_MS,
    );
    assert.equal(called, true);
    assert.equal(out.kind, "failed_permanent");
  });

  it("bubbles DB error when markFailed itself fails during give-up", async () => {
    const client = stubClient({
      async markFailed() {
        return { error: "db_broken" };
      },
    });
    const out = await resolveClaim(
      client,
      claim({ ageMs: 25 * 60 * 60 * 1000 }),
      DEFAULT_GIVE_UP_AFTER_MS,
    );
    assert.deepEqual(out, { bookingId: "bk_test", kind: "error", error: "db_broken" });
  });

  it("completes the claim when Stripe reports succeeded", async () => {
    let receivedRefundId: string | null = null;
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("succeeded"), error: null };
      },
      async markCompleted(input) {
        receivedRefundId = input.refund.id;
        return { error: null };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.equal(receivedRefundId, "re_test");
    assert.equal(out.kind, "completed");
    if (out.kind === "completed") {
      assert.equal(out.refundId, "re_test");
      assert.equal(out.amountCents, 5000);
    }
  });

  it("bubbles DB error when markCompleted fails", async () => {
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("succeeded"), error: null };
      },
      async markCompleted() {
        return { error: "unique_violation" };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.deepEqual(out, { bookingId: "bk_test", kind: "error", error: "unique_violation" });
  });

  it("marks failed_permanent with Stripe's failure_reason when refund is failed", async () => {
    let recorded = "";
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("failed", { failureReason: "expired_or_canceled_card" }), error: null };
      },
      async markFailed(input) {
        recorded = input.reason;
        return { error: null };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.equal(recorded, "expired_or_canceled_card");
    assert.equal(out.kind, "failed_permanent");
  });

  it("falls back to 'stripe_failed' when Stripe supplies no failure_reason", async () => {
    let recorded = "";
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("failed"), error: null };
      },
      async markFailed(input) {
        recorded = input.reason;
        return { error: null };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.equal(recorded, "stripe_failed");
    assert.equal(out.kind, "failed_permanent");
  });

  it("marks failed_permanent when Stripe reports canceled", async () => {
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("canceled"), error: null };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.equal(out.kind, "failed_permanent");
    if (out.kind === "failed_permanent") assert.equal(out.reason, "stripe_canceled");
  });

  it("leaves pending Stripe refunds alone (webhook will pick them up)", async () => {
    let touched = false;
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("pending"), error: null };
      },
      async markCompleted() {
        touched = true;
        return { error: null };
      },
      async markFailed() {
        touched = true;
        return { error: null };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.equal(touched, false);
    assert.equal(out.kind, "still_pending");
    if (out.kind === "still_pending") assert.equal(out.reason, "stripe_pending");
  });

  it("leaves refunds in 'requires_action' alone", async () => {
    const client = stubClient({
      async findStripeRefundByKey() {
        return { refund: refund("requires_action"), error: null };
      },
    });
    const out = await resolveClaim(client, claim(), DEFAULT_GIVE_UP_AFTER_MS);
    assert.equal(out.kind, "still_pending");
    if (out.kind === "still_pending") assert.equal(out.reason, "stripe_requires_action");
  });
});
