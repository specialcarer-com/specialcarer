/**
 * Unit tests for verifyInboundSupportSignature.
 *
 * Covers each documented reject reason plus the happy path. Uses a real
 * HMAC computation so we're testing the constant-time compare, not a
 * mocked equality.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  REPLAY_WINDOW_SECONDS,
  verifyInboundSupportSignature,
} from "./verify-inbound-hmac";

const SECRET = "sc_inbound_test_secret";

function sign(secret: string, ts: number, body: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
}

describe("verifyInboundSupportSignature", () => {
  const body = JSON.stringify({
    from_email: "user@example.com",
    subject: "help",
    body: "please help",
  });
  const now = 1_726_070_400; // fixed anchor so tests don't drift with the wall clock

  it("accepts a valid signature within the replay window", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, now, body),
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.equal(res.valid, true);
  });

  it("accepts a valid signature carrying the sha256= prefix", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: `sha256=${sign(SECRET, now, body)}`,
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.equal(res.valid, true);
  });

  it("rejects when the shared secret is not configured", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign("anything", now, body),
      timestampHeader: String(now),
      nowSeconds: now,
      secret: "",
    });
    assert.deepEqual(res, { valid: false, reason: "secret_missing" });
  });

  it("rejects when the signature header is missing", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: null,
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "signature_missing" });
  });

  it("rejects when the timestamp header is missing", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, now, body),
      timestampHeader: null,
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "timestamp_missing" });
  });

  it("rejects a malformed timestamp", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, now, body),
      timestampHeader: "not-a-number",
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "timestamp_malformed" });
  });

  it("rejects a stale timestamp outside the replay window", () => {
    const stale = now - (REPLAY_WINDOW_SECONDS + 1);
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, stale, body),
      timestampHeader: String(stale),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "timestamp_out_of_window" });
  });

  it("rejects a future timestamp beyond the replay window", () => {
    const future = now + (REPLAY_WINDOW_SECONDS + 1);
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign(SECRET, future, body),
      timestampHeader: String(future),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "timestamp_out_of_window" });
  });

  it("rejects a non-hex signature without throwing", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: "not-hex-!!!",
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "signature_malformed" });
  });

  it("rejects a signature computed with the wrong secret", () => {
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sign("wrong-secret", now, body),
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "signature_mismatch" });
  });

  it("rejects a signature whose length differs from the computed one", () => {
    // Truncate a valid signature — length mismatch must fail without
    // reaching timingSafeEqual (which would throw on mismatched Buffer
    // lengths).
    const sig = sign(SECRET, now, body).slice(0, 40);
    const res = verifyInboundSupportSignature({
      rawBody: body,
      signatureHeader: sig,
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "signature_mismatch" });
  });

  it("rejects when the raw body is tampered after signing", () => {
    const sig = sign(SECRET, now, body);
    const tamperedBody = body.replace("please help", "please help EXTRA");
    const res = verifyInboundSupportSignature({
      rawBody: tamperedBody,
      signatureHeader: sig,
      timestampHeader: String(now),
      nowSeconds: now,
      secret: SECRET,
    });
    assert.deepEqual(res, { valid: false, reason: "signature_mismatch" });
  });
});
