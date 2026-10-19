import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  backgroundChecksCompleteFrom,
  CAREGIVER_VERIFICATION_COLUMNS,
} from "./background-checks";

describe("backgroundChecksCompleteFrom", () => {
  it("is false without a row", () => {
    assert.equal(backgroundChecksCompleteFrom(null), false);
    assert.equal(backgroundChecksCompleteFrom(undefined), false);
  });
  it("uses the UK flag for GB carers", () => {
    assert.equal(
      backgroundChecksCompleteFrom({ country: "GB", uk_fully_cleared: true, us_fully_cleared: false }),
      true,
    );
    assert.equal(
      backgroundChecksCompleteFrom({ country: "GB", uk_fully_cleared: false, us_fully_cleared: true }),
      false,
    );
  });
  it("treats a missing country as UK and null as not cleared", () => {
    assert.equal(
      backgroundChecksCompleteFrom({ country: null, uk_fully_cleared: true, us_fully_cleared: null }),
      true,
    );
    assert.equal(
      backgroundChecksCompleteFrom({ country: "GB", uk_fully_cleared: null, us_fully_cleared: null }),
      false,
    );
  });
  it("uses the US flag for US carers", () => {
    assert.equal(
      backgroundChecksCompleteFrom({ country: "US", uk_fully_cleared: false, us_fully_cleared: true }),
      true,
    );
  });
});

describe("caregiver_verification columns", () => {
  // The view in production exposes uk_/us_ flags only (checked against the
  // live schema); asking for gb_ or a generic fully_cleared column errors.
  it("asks for the uk/us flags and nothing the view lacks", () => {
    assert.match(CAREGIVER_VERIFICATION_COLUMNS, /\buk_fully_cleared\b/);
    assert.match(CAREGIVER_VERIFICATION_COLUMNS, /\bus_fully_cleared\b/);
    assert.doesNotMatch(CAREGIVER_VERIFICATION_COLUMNS, /\bgb_fully_cleared\b/);
    assert.doesNotMatch(CAREGIVER_VERIFICATION_COLUMNS, /(^|,\s*)fully_cleared\b/);
  });
});
