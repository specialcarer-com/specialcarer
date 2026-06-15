/**
 * Tests for the Designated Payer handlers (gap 31).
 *
 * Drives the pure handlers with a stubbed client (matches list-handler
 * conventions) so we don't pull in next/headers + cookie machinery.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleGetDesignatedPayer,
  handleSetDesignatedPayer,
  type DesignatedPayerClient,
  type DesignatedPayerBookingRow,
} from "@/lib/family/designated-payer-handler";
import type {
  ReissueAdapter,
  CurrentIntent,
} from "@/lib/family/designated-payer-reissue";
import type { HouseholdMember } from "@/lib/family/household";

const SEEKER = "00000000-0000-0000-0000-000000000001";
const PAYER = "00000000-0000-0000-0000-000000000002";
const STRANGER = "00000000-0000-0000-0000-000000000003";
const OUTSIDER = "00000000-0000-0000-0000-000000000009";
const BOOKING = "00000000-0000-0000-0000-0000000000aa";
const FAMILY = "00000000-0000-0000-0000-0000000000ff";

function booking(
  payer: string | null = null,
): DesignatedPayerBookingRow {
  return { id: BOOKING, seeker_id: SEEKER, designated_payer_user_id: payer };
}

function members(): HouseholdMember[] {
  return [
    { user_id: SEEKER, display_name: "Pat Seeker" },
    { user_id: PAYER, display_name: "Alex Adult-Child" },
  ];
}

function client(
  overrides?: Partial<DesignatedPayerClient> & { payer?: string | null },
): DesignatedPayerClient {
  const base: DesignatedPayerClient = {
    async getBooking() {
      return { data: booking(overrides?.payer ?? null), error: null };
    },
    async setDesignatedPayer() {
      return { error: null };
    },
    async getOwnFamilyId() {
      return { familyId: FAMILY, error: null };
    },
    async listActiveMembers() {
      return {
        members: [{ user_id: PAYER, display_name: "Alex Adult-Child" }],
        error: null,
      };
    },
    async getUserName(uid) {
      return members().find((m) => m.user_id === uid)?.display_name ?? null;
    },
  };
  return { ...base, ...overrides };
}

describe("handleGetDesignatedPayer", () => {
  it("returns 403 feature disabled when the flag is off", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "feature disabled");
  });

  it("returns 200 with current payer + household for the seeker", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client({ payer: PAYER }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      designatedPayerUserId: string | null;
      designatedPayerName: string | null;
      isFlagEnabled: boolean;
      householdAdults: HouseholdMember[];
    };
    assert.equal(body.designatedPayerUserId, PAYER);
    assert.equal(body.designatedPayerName, "Alex Adult-Child");
    assert.equal(body.isFlagEnabled, true);
    assert.deepEqual(
      body.householdAdults.map((m) => m.user_id),
      [SEEKER, PAYER],
    );
  });

  it("returns 403 for a non-seeker", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: STRANGER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client({
        async getBooking() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when the booking lookup fails", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client({
        async getBooking() {
          return { data: null, error: { message: "boom" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

describe("handleSetDesignatedPayer", () => {
  it("returns 403 feature disabled when the flag is off", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 200 when the seeker sets a valid household payer", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      designatedPayerUserId: string | null;
      designatedPayerName: string | null;
    };
    assert.equal(body.designatedPayerUserId, PAYER);
    assert.equal(body.designatedPayerName, "Alex Adult-Child");
  });

  it("returns 200 when the seeker clears the payer (null)", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: null,
      flagEnabled: true,
      client: client({ payer: PAYER }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { designatedPayerUserId: string | null };
    assert.equal(body.designatedPayerUserId, null);
  });

  it("returns 400 when the target user is not in the household", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: OUTSIDER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when payerUserId is the wrong type", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: 123,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when payerUserId is an empty string", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: "   ",
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("returns 403 for a non-seeker", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: STRANGER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client({
        async getBooking() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when the update fails", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client({
        async setDesignatedPayer() {
          return { error: { message: "db down" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

/**
 * PaymentIntent re-issue (gap 31 follow-up, rollout plan Option B). These drive
 * handleSetDesignatedPayer with both the household client AND a stubbed Stripe
 * re-issue adapter, asserting the per-status outcomes from the rollout plan.
 */
function intent(status: string): CurrentIntent {
  return {
    paymentIntentId: "pi_old",
    status,
    amountCents: 18000,
    currency: "gbp",
    metadata: { booking_id: BOOKING, seeker_id: SEEKER },
    applicationFeeCents: 5400,
    destinationAccountId: "acct_carer",
  };
}

type Calls = {
  cancelled: string[];
  created: number;
  persisted: { oldId: string; newId: string }[];
};

function reissueAdapter(opts: {
  current: CurrentIntent | null;
  hasPm?: boolean;
  cancelThrows?: boolean;
  createThrows?: boolean;
  calls?: Calls;
}): ReissueAdapter {
  const calls = opts.calls;
  return {
    async getCurrentIntent() {
      return opts.current;
    },
    async getSavedPaymentMethod() {
      return opts.hasPm
        ? { stripeCustomerId: "cus_payer", paymentMethodId: "pm_payer" }
        : null;
    },
    async cancelIntent(id) {
      if (opts.cancelThrows) {
        throw Object.assign(new Error("cancel boom"), { code: "lock_timeout" });
      }
      calls?.cancelled.push(id);
    },
    async createIntent() {
      if (opts.createThrows) {
        throw Object.assign(new Error("create boom"), { code: "card_declined" });
      }
      if (calls) calls.created += 1;
      return { id: "pi_new" };
    },
    async persistNewIntent({ oldPaymentIntentId, newPaymentIntentId }) {
      calls?.persisted.push({
        oldId: oldPaymentIntentId,
        newId: newPaymentIntentId,
      });
    },
  };
}

describe("handleSetDesignatedPayer — PaymentIntent re-issue", () => {
  for (const status of ["requires_payment_method", "requires_confirmation"]) {
    it(`re-issues when intent is ${status} and payer has a PM`, async () => {
      const calls: Calls = { cancelled: [], created: 0, persisted: [] };
      const setCalls: (string | null)[] = [];
      const res = await handleSetDesignatedPayer({
        user_id: SEEKER,
        booking_id: BOOKING,
        payerUserId: PAYER,
        flagEnabled: true,
        client: client({
          async setDesignatedPayer(_id, payer) {
            setCalls.push(payer);
            return { error: null };
          },
        }),
        reissue: reissueAdapter({ current: intent(status), hasPm: true, calls }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        ok: boolean;
        intentReissued: boolean;
        newIntentId: string;
        payerHasPaymentMethod: boolean;
      };
      assert.equal(body.ok, true);
      assert.equal(body.intentReissued, true);
      assert.equal(body.newIntentId, "pi_new");
      assert.equal(body.payerHasPaymentMethod, true);
      assert.deepEqual(calls.cancelled, ["pi_old"]);
      assert.equal(calls.created, 1);
      assert.deepEqual(calls.persisted, [{ oldId: "pi_old", newId: "pi_new" }]);
      // Column written once (the set), never rolled back.
      assert.deepEqual(setCalls, [PAYER]);
    });
  }

  for (const status of ["processing", "succeeded", "canceled"]) {
    it(`does not re-issue when intent is ${status}; sets payer for future charges`, async () => {
      const calls: Calls = { cancelled: [], created: 0, persisted: [] };
      const res = await handleSetDesignatedPayer({
        user_id: SEEKER,
        booking_id: BOOKING,
        payerUserId: PAYER,
        flagEnabled: true,
        client: client(),
        reissue: reissueAdapter({ current: intent(status), hasPm: true, calls }),
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        ok: boolean;
        intentReissued: boolean;
        reason: string;
        payerSetForFutureCharges: boolean;
      };
      assert.equal(body.intentReissued, false);
      assert.equal(body.reason, "intent_already_in_flight");
      assert.equal(body.payerSetForFutureCharges, true);
      // No Stripe mutations.
      assert.deepEqual(calls.cancelled, []);
      assert.equal(calls.created, 0);
    });
  }

  it("does not re-issue when payer has no saved PM; warns + no Stripe mutation", async () => {
    const calls: Calls = { cancelled: [], created: 0, persisted: [] };
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client(),
      reissue: reissueAdapter({
        current: intent("requires_payment_method"),
        hasPm: false,
        calls,
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      intentReissued: boolean;
      payerHasPaymentMethod: boolean;
      warning: string;
    };
    assert.equal(body.intentReissued, false);
    assert.equal(body.payerHasPaymentMethod, false);
    assert.equal(body.warning, "payer_no_pm_will_fallback");
    assert.deepEqual(calls.cancelled, []);
    assert.equal(calls.created, 0);
  });

  it("does not re-issue when the booking has no existing intent", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client(),
      reissue: reissueAdapter({ current: null, hasPm: true }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      intentReissued: boolean;
      payerSetForFutureCharges: boolean;
    };
    assert.equal(body.intentReissued, false);
    assert.equal(body.payerSetForFutureCharges, true);
  });

  it("rolls back the column + returns 500 when Stripe cancel throws", async () => {
    const setCalls: (string | null)[] = [];
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client({
        payer: null,
        async setDesignatedPayer(_id, payer) {
          setCalls.push(payer);
          return { error: null };
        },
      }),
      reissue: reissueAdapter({
        current: intent("requires_payment_method"),
        hasPm: true,
        cancelThrows: true,
      }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { phase: string; code: string };
    assert.equal(body.phase, "cancel");
    // Column set to PAYER then rolled back to the previous value (null).
    assert.deepEqual(setCalls, [PAYER, null]);
  });

  it("rolls back the column + returns 500 when Stripe create throws after cancel", async () => {
    const calls: Calls = { cancelled: [], created: 0, persisted: [] };
    const setCalls: (string | null)[] = [];
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client({
        payer: null,
        async setDesignatedPayer(_id, payer) {
          setCalls.push(payer);
          return { error: null };
        },
      }),
      reissue: reissueAdapter({
        current: intent("requires_payment_method"),
        hasPm: true,
        createThrows: true,
        calls,
      }),
    });
    assert.equal(res.status, 500);
    const body = (await res.json()) as { phase: string; code: string };
    assert.equal(body.phase, "create");
    // Old intent was cancelled, new one never persisted, column rolled back.
    assert.deepEqual(calls.cancelled, ["pi_old"]);
    assert.deepEqual(calls.persisted, []);
    assert.deepEqual(setCalls, [PAYER, null]);
  });

  it("does not re-issue when the flag is off (regression: still 403)", async () => {
    const calls: Calls = { cancelled: [], created: 0, persisted: [] };
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: false,
      client: client(),
      reissue: reissueAdapter({
        current: intent("requires_payment_method"),
        hasPm: true,
        calls,
      }),
    });
    assert.equal(res.status, 403);
    assert.deepEqual(calls.cancelled, []);
    assert.equal(calls.created, 0);
  });

  it("does not re-issue when payer is outside the household (regression: 400)", async () => {
    const calls: Calls = { cancelled: [], created: 0, persisted: [] };
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: OUTSIDER,
      flagEnabled: true,
      client: client(),
      reissue: reissueAdapter({
        current: intent("requires_payment_method"),
        hasPm: true,
        calls,
      }),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(calls.cancelled, []);
    assert.equal(calls.created, 0);
  });
});
