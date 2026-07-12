/**
 * Unit tests for verifyVeriffSignature. Veriff signs deliveries with
 *   X-HMAC-SIGNATURE: <hex_hmac>
 * where the HMAC-SHA256 is over the RAW request body using
 * VERIFF_SIGNATURE_KEY. A real HMAC is computed so the verifier runs against
 * genuine input. Mirrors the Whereby webhook test pattern.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { verifyVeriffSignature } from "../webhook";

const SECRET = "veriff_sig_test";

function hmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

beforeEach(() => {
  process.env.VERIFF_SIGNATURE_KEY = SECRET;
});

afterEach(() => {
  delete process.env.VERIFF_SIGNATURE_KEY;
});

describe("verifyVeriffSignature", () => {
  const body = JSON.stringify({ verification: { status: "approved" } });

  it("accepts a valid bare-hex signature and returns the parsed payload", () => {
    const res = verifyVeriffSignature(body, hmac(SECRET, body));
    assert.equal(res.valid, true);
    assert.deepEqual(res.payload, { verification: { status: "approved" } });
  });

  it("accepts a valid signature carrying the sha256= prefix", () => {
    const res = verifyVeriffSignature(body, `sha256=${hmac(SECRET, body)}`);
    assert.equal(res.valid, true);
  });

  it("rejects a missing/empty header", () => {
    assert.equal(verifyVeriffSignature(body, null).valid, false);
    assert.equal(verifyVeriffSignature(body, "").valid, false);
  });

  it("rejects when the signature secret is unset", () => {
    delete process.env.VERIFF_SIGNATURE_KEY;
    assert.equal(verifyVeriffSignature(body, hmac(SECRET, body)).valid, false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const res = verifyVeriffSignature(body, hmac("wrong_secret", body));
    assert.equal(res.valid, false);
  });

  it("rejects a signature computed over a different body", () => {
    const res = verifyVeriffSignature(body, hmac(SECRET, "different body"));
    assert.equal(res.valid, false);
  });

  it("rejects malformed hex in the signature without throwing", () => {
    const sig = "zz" + "0".repeat(62);
    assert.doesNotThrow(() => verifyVeriffSignature(body, sig));
    assert.equal(verifyVeriffSignature(body, sig).valid, false);
  });

  it("rejects a signature of the wrong length", () => {
    assert.equal(verifyVeriffSignature(body, "deadbeef").valid, false);
  });

  it("still parses the payload even when the signature is invalid", () => {
    const res = verifyVeriffSignature(body, "deadbeef");
    assert.equal(res.valid, false);
    assert.deepEqual(res.payload, { verification: { status: "approved" } });
  });

  it("returns null payload for an unparseable body", () => {
    const res = verifyVeriffSignature("{not json", hmac(SECRET, "{not json"));
    assert.equal(res.payload, null);
    // signature still matches the raw bytes, so valid is true
    assert.equal(res.valid, true);
  });
});
