import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveReferralCode } from "./code";

describe("deriveReferralCode", () => {
  it("uses first 6 letters of the name as prefix", () => {
    const c = deriveReferralCode(
      "Steve Reynolds",
      "00000000-0000-0000-0000-000000000001",
    );
    assert.match(c, /^STEVER-[0-9A-Z]{4}$/);
  });

  it("strips non-alphanumerics from the name", () => {
    const c = deriveReferralCode(
      "Mary-Anne O'Brien",
      "00000000-0000-0000-0000-000000000002",
    );
    assert.match(c, /^MARYAN-[0-9A-Z]{4}$/);
  });

  it("falls back to FRIEND when the name has no letters", () => {
    const c = deriveReferralCode(
      "   !@#",
      "00000000-0000-0000-0000-000000000003",
    );
    assert.match(c, /^FRIEND-[0-9A-Z]{4}$/);
  });

  it("is deterministic for a given (name, id)", () => {
    const a = deriveReferralCode("Jess", "abc-def-123");
    const b = deriveReferralCode("Jess", "abc-def-123");
    assert.equal(a, b);
  });

  it("varies the suffix when the user id changes", () => {
    const a = deriveReferralCode("Jess", "user-aaa");
    const b = deriveReferralCode("Jess", "user-bbb");
    assert.equal(a.split("-")[0], b.split("-")[0]);
    assert.notEqual(a.split("-")[1], b.split("-")[1]);
  });
});
