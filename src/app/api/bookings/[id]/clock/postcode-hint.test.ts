/**
 * The geofence postcode hint is decorative — a read failure must NOT sink the
 * clock-in (#6). readPostcodeHint swallows errors down to a null hint.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPostcodeHint } from "./postcode-hint";

describe("readPostcodeHint", () => {
  it("returns the postcode when the fetch succeeds", async () => {
    const out = await readPostcodeHint(async () => "SW1A 1AA");
    assert.equal(out, "SW1A 1AA");
  });

  it("returns null (does not throw) when the fetch throws", async () => {
    const out = await readPostcodeHint(async () => {
      throw new Error("client postcode read failed: boom");
    });
    assert.equal(out, null);
  });

  it("passes through a null postcode", async () => {
    const out = await readPostcodeHint(async () => null);
    assert.equal(out, null);
  });
});
