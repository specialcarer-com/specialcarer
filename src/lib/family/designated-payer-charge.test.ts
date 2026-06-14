/**
 * Tests for the Designated Payer payment-flow resolution (gap 31).
 *
 * Asserts the three required cases:
 *   (a) flag OFF                                  -> seeker charged
 *   (b) flag ON + payer set + payer has saved PM  -> payer charged
 *   (c) flag ON + payer set + payer has NO PM     -> seeker charged + warn log
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBookingPayer,
  type PayerChargeAdapter,
} from "@/lib/family/designated-payer-charge";

const SEEKER = "seeker-1";
const PAYER = "payer-1";

function adapter(hasPm: boolean): PayerChargeAdapter {
  return {
    async getSavedPaymentMethod() {
      return hasPm
        ? { stripeCustomerId: "cus_123", paymentMethodId: "pm_123" }
        : null;
    },
  };
}

function spyLogger() {
  const warns: string[] = [];
  const infos: string[] = [];
  return {
    warns,
    infos,
    logger: {
      warn: (m: string) => warns.push(m),
      info: (m: string) => infos.push(m),
    },
  };
}

describe("resolveBookingPayer", () => {
  it("(a) flag OFF → seeker charged, no override even if a payer is set", async () => {
    const spy = spyLogger();
    const res = await resolveBookingPayer({
      seekerId: SEEKER,
      designatedPayerUserId: PAYER,
      flagEnabled: false,
      adapter: adapter(true),
      logger: spy.logger,
    });
    assert.equal(res.chargedUserId, SEEKER);
    assert.equal(res.override, null);
    // Flag off: we never even consult the payer's payment method or log.
    assert.equal(spy.warns.length, 0);
    assert.equal(spy.infos.length, 0);
  });

  it("flag ON but no designated payer → seeker charged (legacy)", async () => {
    const res = await resolveBookingPayer({
      seekerId: SEEKER,
      designatedPayerUserId: null,
      flagEnabled: true,
      adapter: adapter(true),
    });
    assert.equal(res.chargedUserId, SEEKER);
    assert.equal(res.override, null);
  });

  it("(b) flag ON + payer set + payer has saved PM → payer charged off-session", async () => {
    const spy = spyLogger();
    const res = await resolveBookingPayer({
      seekerId: SEEKER,
      designatedPayerUserId: PAYER,
      flagEnabled: true,
      adapter: adapter(true),
      logger: spy.logger,
    });
    assert.equal(res.chargedUserId, PAYER);
    assert.deepEqual(res.override, {
      customer: "cus_123",
      payment_method: "pm_123",
      off_session: true,
      confirm: true,
    });
    assert.equal(spy.infos.length, 1);
  });

  it("(c) flag ON + payer set + payer has NO saved PM → seeker charged + warn", async () => {
    const spy = spyLogger();
    const res = await resolveBookingPayer({
      seekerId: SEEKER,
      designatedPayerUserId: PAYER,
      flagEnabled: true,
      adapter: adapter(false),
      logger: spy.logger,
    });
    assert.equal(res.chargedUserId, SEEKER);
    assert.equal(res.override, null);
    assert.equal(spy.warns.length, 1);
    assert.match(spy.warns[0], /no saved payment method/);
  });

  it("payer == seeker → no override (nothing to do)", async () => {
    const res = await resolveBookingPayer({
      seekerId: SEEKER,
      designatedPayerUserId: SEEKER,
      flagEnabled: true,
      adapter: adapter(true),
    });
    assert.equal(res.chargedUserId, SEEKER);
    assert.equal(res.override, null);
  });
});
