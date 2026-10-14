import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CARER_MCC,
  CARER_PRODUCT_DESCRIPTION,
  buildCarerAccountPrefill,
  splitFullName,
} from "./carer-account-profile";

describe("splitFullName", () => {
  it("splits first and remaining names", () => {
    assert.deepEqual(splitFullName("Jane Q Doe"), { first_name: "Jane", last_name: "Q Doe" });
  });
  it("handles one word, blanks and null", () => {
    assert.deepEqual(splitFullName("Jane"), { first_name: "Jane" });
    assert.deepEqual(splitFullName("   "), {});
    assert.deepEqual(splitFullName(null), {});
  });
});

describe("buildCarerAccountPrefill", () => {
  it("fills business profile so Stripe skips the industry question", () => {
    const out = buildCarerAccountPrefill({ fullName: "David Okafor", email: "d@example.com" });
    assert.equal(out.business_profile?.mcc, CARER_MCC);
    assert.equal(out.business_profile?.product_description, CARER_PRODUCT_DESCRIPTION);
    assert.equal(out.business_profile?.name, "David Okafor");
    assert.deepEqual(out.individual, { first_name: "David", last_name: "Okafor", email: "d@example.com" });
  });
  it("still sends the business profile when we know nothing about the carer", () => {
    const out = buildCarerAccountPrefill({});
    assert.equal(out.business_profile?.mcc, CARER_MCC);
    assert.equal(out.business_profile?.name, undefined);
    assert.equal(out.individual, undefined);
  });
});
