/**
 * Unit tests for 2FA recovery code generation + hashing (gap 13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
  formatRecoveryCode,
  normaliseRecoveryCode,
} from "./recovery-codes";
import {
  generateRecoveryCode,
  generateRecoveryCodeBatch,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "./recovery-codes-core";

const BASE32 = /^[0-9A-HJKMNP-TV-Z]+$/; // Crockford: no I, L, O, U

test("generateRecoveryCode produces a 32-char Crockford base32 string", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateRecoveryCode();
    assert.equal(code.length, RECOVERY_CODE_LENGTH);
    assert.match(code, BASE32);
  }
});

test("a batch has exactly 10 distinct codes", () => {
  const batch = generateRecoveryCodeBatch();
  assert.equal(batch.length, RECOVERY_CODE_COUNT);
  assert.equal(new Set(batch).size, RECOVERY_CODE_COUNT, "no collisions in batch");
  for (const c of batch) assert.match(c, BASE32);
});

test("format groups into four-char chunks; normalise reverses it", () => {
  const code = generateRecoveryCode();
  const formatted = formatRecoveryCode(code);
  assert.equal(formatted.replace(/-/g, ""), code);
  assert.equal(formatted.split("-").length, RECOVERY_CODE_LENGTH / 4);
  assert.equal(normaliseRecoveryCode(formatted), code);
});

test("normalise strips whitespace/dashes and upper-cases", () => {
  assert.equal(normaliseRecoveryCode("  abcd-ef gh "), "ABCDEFGH");
});

test("hash + verify roundtrip succeeds for the right code", async () => {
  const code = generateRecoveryCode();
  const hash = await hashRecoveryCode(code);
  assert.ok(hash.startsWith("scrypt$"));
  assert.equal(await verifyRecoveryCode(code, hash), true);
});

test("verify accepts the formatted (dashed, lower-case) form", async () => {
  const code = generateRecoveryCode();
  const hash = await hashRecoveryCode(code);
  assert.equal(await verifyRecoveryCode(formatRecoveryCode(code).toLowerCase(), hash), true);
});

test("verify rejects a wrong code and malformed hashes", async () => {
  const hash = await hashRecoveryCode(generateRecoveryCode());
  assert.equal(await verifyRecoveryCode(generateRecoveryCode(), hash), false);
  assert.equal(await verifyRecoveryCode("whatever", "not-a-hash"), false);
  assert.equal(await verifyRecoveryCode("whatever", "scrypt$0$$"), false);
});

test("two hashes of the same code differ (random salt) but both verify", async () => {
  const code = generateRecoveryCode();
  const h1 = await hashRecoveryCode(code);
  const h2 = await hashRecoveryCode(code);
  assert.notEqual(h1, h2);
  assert.equal(await verifyRecoveryCode(code, h1), true);
  assert.equal(await verifyRecoveryCode(code, h2), true);
});
