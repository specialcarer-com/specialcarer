/**
 * Tests for the pure PaymentIntent re-issue logic (gap 31 follow-up).
 *
 * Drives reissueIntentForPayer with a stubbed Stripe/payments adapter so the
 * per-status guard, the no-PM fallback, and the cancel/create failure paths are
 * unit-tested without Stripe or Supabase.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reissueIntentForPayer,
  isReissuableStatus,
  type ReissueAdapter,
  type CurrentIntent,
} from "@/lib/family/designated-payer-reissue";

const BOOKING = "booking-1";
const SEEKER = "seeker-1";
const PAYER = "payer-1";

function intent(status: string): CurrentIntent {
  return {
    paymentIntentId: "pi_old",
    status,
    amountCents: 18000,
    currency: "gbp",
    metadata: { booking_id: BOOKING },
    applicationFeeCents: 5400,
    destinationAccountId: "acct_carer",
  };
}

type Calls = {
  cancelled: string[];
  created: { metadata: Record<string, string> }[];
  persisted: { oldId: string; newId: string }[];
};

function adapter(opts: {
  current: CurrentIntent | null;
  hasPm?: boolean;
  cancelThrows?: boolean;
  createThrows?: boolean;
  getCurrentIntentThrows?: boolean;
  persistThrows?: boolean;
  calls?: Calls;
}): ReissueAdapter {
  const calls = opts.calls;
  return {
    async getCurrentIntent() {
      if (opts.getCurrentIntentThrows) {
        throw Object.assign(new Error("retrieve boom"), {
          phase: "retrieve",
          code: "rate_limit",
        });
      }
      return opts.current;
    },
    async getSavedPaymentMethod() {
      return opts.hasPm
        ? { stripeCustomerId: "cus_payer", paymentMethodId: "pm_payer" }
        : null;
    },
    async cancelIntent(id) {
      if (opts.cancelThrows) throw new Error("cancel boom");
      calls?.cancelled.push(id);
    },
    async createIntent(input) {
      if (opts.createThrows) throw new Error("create boom");
      calls?.created.push({ metadata: input.metadata });
      return { id: "pi_new" };
    },
    async persistNewIntent({ oldPaymentIntentId, newPaymentIntentId }) {
      if (opts.persistThrows) {
        throw Object.assign(new Error("persist boom"), {
          phase: "persist",
          code: "db_insert_failed",
        });
      }
      calls?.persisted.push({
        oldId: oldPaymentIntentId,
        newId: newPaymentIntentId,
      });
    },
  };
}

function silentLogger() {
  return { warn() {}, info() {}, error() {} };
}

describe("isReissuableStatus", () => {
  it("accepts the three pre-charge statuses only", () => {
    assert.equal(isReissuableStatus("requires_payment_method"), true);
    assert.equal(isReissuableStatus("requires_confirmation"), true);
    assert.equal(isReissuableStatus("requires_action"), true);
    assert.equal(isReissuableStatus("processing"), false);
    assert.equal(isReissuableStatus("succeeded"), false);
    assert.equal(isReissuableStatus("canceled"), false);
  });
});

describe("reissueIntentForPayer", () => {
  it("re-issues, carrying metadata + stamping charged_user_id", async () => {
    const calls: Calls = { cancelled: [], created: [], persisted: [] };
    const res = await reissueIntentForPayer({
      bookingId: BOOKING,
      seekerId: SEEKER,
      payerUserId: PAYER,
      adapter: adapter({
        current: intent("requires_action"),
        hasPm: true,
        calls,
      }),
      logger: silentLogger(),
    });
    assert.equal(res.kind, "reissued");
    if (res.kind === "reissued") {
      assert.equal(res.newIntentId, "pi_new");
      assert.equal(res.payerCustomerId, "cus_payer");
    }
    assert.deepEqual(calls.cancelled, ["pi_old"]);
    assert.equal(calls.created[0].metadata.booking_id, BOOKING);
    assert.equal(calls.created[0].metadata.charged_user_id, PAYER);
    assert.deepEqual(calls.persisted, [{ oldId: "pi_old", newId: "pi_new" }]);
  });

  it("returns no_intent when the booking has no PI", async () => {
    const res = await reissueIntentForPayer({
      bookingId: BOOKING,
      seekerId: SEEKER,
      payerUserId: PAYER,
      adapter: adapter({ current: null, hasPm: true }),
      logger: silentLogger(),
    });
    assert.equal(res.kind, "no_intent");
  });

  it("returns already_in_flight for a processing intent (no Stripe mutation)", async () => {
    const calls: Calls = { cancelled: [], created: [], persisted: [] };
    const res = await reissueIntentForPayer({
      bookingId: BOOKING,
      seekerId: SEEKER,
      payerUserId: PAYER,
      adapter: adapter({ current: intent("processing"), hasPm: true, calls }),
      logger: silentLogger(),
    });
    assert.equal(res.kind, "already_in_flight");
    assert.deepEqual(calls.cancelled, []);
    assert.equal(calls.created.length, 0);
  });

  it("returns no_pm when the payer has no saved method (no cancel/create)", async () => {
    const calls: Calls = { cancelled: [], created: [], persisted: [] };
    const res = await reissueIntentForPayer({
      bookingId: BOOKING,
      seekerId: SEEKER,
      payerUserId: PAYER,
      adapter: adapter({
        current: intent("requires_payment_method"),
        hasPm: false,
        calls,
      }),
      logger: silentLogger(),
    });
    assert.equal(res.kind, "no_pm");
    assert.deepEqual(calls.cancelled, []);
    assert.equal(calls.created.length, 0);
  });

  it("returns failed/cancel when cancel throws (nothing created)", async () => {
    const calls: Calls = { cancelled: [], created: [], persisted: [] };
    const res = await reissueIntentForPayer({
      bookingId: BOOKING,
      seekerId: SEEKER,
      payerUserId: PAYER,
      adapter: adapter({
        current: intent("requires_payment_method"),
        hasPm: true,
        cancelThrows: true,
        calls,
      }),
      logger: silentLogger(),
    });
    assert.equal(res.kind, "failed");
    if (res.kind === "failed") assert.equal(res.phase, "cancel");
    assert.equal(calls.created.length, 0);
  });

  it("returns failed/create when create throws after a successful cancel", async () => {
    const calls: Calls = { cancelled: [], created: [], persisted: [] };
    const res = await reissueIntentForPayer({
      bookingId: BOOKING,
      seekerId: SEEKER,
      payerUserId: PAYER,
      adapter: adapter({
        current: intent("requires_payment_method"),
        hasPm: true,
        createThrows: true,
        calls,
      }),
      logger: silentLogger(),
    });
    assert.equal(res.kind, "failed");
    if (res.kind === "failed") assert.equal(res.phase, "create");
    assert.deepEqual(calls.cancelled, ["pi_old"]);
    assert.deepEqual(calls.persisted, []);
  });

  it("propagates when getCurrentIntent throws (e.g. Stripe retrieve failure)", async () => {
    await assert.rejects(
      () =>
        reissueIntentForPayer({
          bookingId: BOOKING,
          seekerId: SEEKER,
          payerUserId: PAYER,
          adapter: adapter({
            current: intent("requires_payment_method"),
            hasPm: true,
            getCurrentIntentThrows: true,
          }),
          logger: silentLogger(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { phase?: string }).phase, "retrieve");
        assert.equal((err as { code?: string }).code, "rate_limit");
        return true;
      },
    );
  });

  it("propagates when persistNewIntent throws (DB write failure)", async () => {
    const calls: Calls = { cancelled: [], created: [], persisted: [] };
    await assert.rejects(
      () =>
        reissueIntentForPayer({
          bookingId: BOOKING,
          seekerId: SEEKER,
          payerUserId: PAYER,
          adapter: adapter({
            current: intent("requires_payment_method"),
            hasPm: true,
            persistThrows: true,
            calls,
          }),
          logger: silentLogger(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { phase?: string }).phase, "persist");
        assert.deepEqual(calls.cancelled, ["pi_old"]);
        assert.equal(calls.created.length, 1);
        assert.deepEqual(calls.persisted, []);
        return true;
      },
    );
  });
});
