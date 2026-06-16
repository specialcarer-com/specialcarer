/**
 * Unit tests for verifyWherebySignature. Whereby signs deliveries with
 *   Whereby-Signature: t=<unix_seconds>,v1=<hex_hmac>
 * where the HMAC-SHA256 is over `${t}.${rawBody}`. A real HMAC is computed
 * against WHEREBY_WEBHOOK_SECRET so the verifier runs against genuine input.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { verifyWherebySignature } from "../webhook";

const SECRET = "whsec_test";

function hmac(secret: string, t: number, body: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
}

function header(t: number, v1: string): string {
  return `t=${t},v1=${v1}`;
}

beforeEach(() => {
  process.env.WHEREBY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.WHEREBY_WEBHOOK_SECRET;
});

describe("verifyWherebySignature", () => {
  const body = JSON.stringify({ type: "room.client.joined" });
  const now = 1_700_000_000_000; // fixed "now" in ms
  const tNow = Math.floor(now / 1000);

  it("accepts a valid signature with a recent timestamp", () => {
    const sig = header(tNow, hmac(SECRET, tNow, body));
    assert.equal(verifyWherebySignature(body, sig, now), true);
  });

  it("rejects a valid HMAC whose timestamp is >5 min old (replay)", () => {
    const old = tNow - 301;
    const sig = header(old, hmac(SECRET, old, body));
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });

  it("rejects a valid HMAC whose timestamp is >5 min in the future", () => {
    const future = tNow + 301;
    const sig = header(future, hmac(SECRET, future, body));
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });

  it("rejects a missing/empty header", () => {
    assert.equal(verifyWherebySignature(body, null, now), false);
    assert.equal(verifyWherebySignature(body, "", now), false);
  });

  it("rejects a header missing t=", () => {
    const sig = `v1=${hmac(SECRET, tNow, body)}`;
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });

  it("rejects a header missing v1=", () => {
    const sig = `t=${tNow}`;
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });

  it("rejects bad hex in v1 without throwing", () => {
    const sig = header(tNow, "zz" + "0".repeat(62));
    assert.doesNotThrow(() => verifyWherebySignature(body, sig, now));
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const sig = header(tNow, hmac("wrong_secret", tNow, body));
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });

  it("rejects a signature computed over a different body", () => {
    const sig = header(tNow, hmac(SECRET, tNow, "different body"));
    assert.equal(verifyWherebySignature(body, sig, now), false);
  });
});
