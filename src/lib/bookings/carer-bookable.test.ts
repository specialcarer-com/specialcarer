import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { carerBookableError, CARER_UNAVAILABLE_MESSAGE } from "./carer-bookable";

describe("carerBookableError", () => {
  it("allows a published carer", () => {
    assert.equal(carerBookableError({ is_published: true }), null);
  });
  it("refuses unpublished, null and missing carers", () => {
    for (const row of [{ is_published: false }, { is_published: null }, null, undefined]) {
      const r = carerBookableError(row);
      assert.equal(r?.reason, "carer_unpublished");
      assert.equal(r?.error, CARER_UNAVAILABLE_MESSAGE);
    }
  });
});

describe("booking route wiring", () => {
  const src = readFileSync(
    new URL("../../app/api/stripe/create-booking-intent/route.ts", import.meta.url),
    "utf8",
  );
  it("checks the carer is published before any Stripe work", () => {
    const check = src.indexOf("carerBookableError(");
    const readiness = src.indexOf("assertConnectReadyForBooking(\n    { admin, stripe }");
    assert.ok(check > 0, "route uses carerBookableError");
    assert.ok(readiness > 0 && check < readiness, "published check runs before Stripe readiness");
    assert.match(src, /status: 409/);
  });
});
