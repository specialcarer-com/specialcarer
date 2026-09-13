/**
 * Tests for invitation-token.ts (Phase D — PR D1).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  generateToken,
  hashToken,
  timingSafeEqualHex,
} from "./invitation-token";

describe("generateToken()", () => {
  test("returns a URL-safe base64url raw token with 256 bits of entropy", () => {
    const { rawToken } = generateToken();
    // base64url alphabet only (RFC 4648 §5) — no `+`, `/`, or `=` padding.
    assert.match(rawToken, /^[A-Za-z0-9_-]+$/);
    // 32 bytes → 43 chars unpadded base64url.
    assert.equal(rawToken.length, 43);
  });

  test("hash is SHA-256 hex of the raw token", () => {
    const { rawToken, tokenHash } = generateToken();
    const expected = createHash("sha256")
      .update(rawToken, "utf8")
      .digest("hex");
    assert.equal(tokenHash, expected);
    assert.equal(tokenHash.length, 64);
    assert.match(tokenHash, /^[a-f0-9]+$/);
  });

  test("produces a fresh pair on every call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { rawToken, tokenHash } = generateToken();
      assert.ok(!seen.has(rawToken), "raw token collision");
      assert.ok(!seen.has(tokenHash), "hash collision");
      seen.add(rawToken);
      seen.add(tokenHash);
    }
  });
});

describe("hashToken()", () => {
  test("is deterministic", () => {
    const a = hashToken("hello world");
    const b = hashToken("hello world");
    assert.equal(a, b);
  });

  test("differs for any input change", () => {
    const a = hashToken("hello world");
    const b = hashToken("hello worlD");
    assert.notEqual(a, b);
  });

  test("trims incoming whitespace (email-client newline safety)", () => {
    const base = hashToken("abcdef");
    assert.equal(hashToken("  abcdef  "), base);
    assert.equal(hashToken("abcdef\n"), base);
    assert.equal(hashToken("\r\nabcdef"), base);
  });

  test("returns 64-char lowercase hex", () => {
    const h = hashToken("anything");
    assert.equal(h.length, 64);
    assert.match(h, /^[a-f0-9]{64}$/);
  });
});

describe("timingSafeEqualHex()", () => {
  test("true for equal hashes", () => {
    const a = hashToken("same");
    const b = hashToken("same");
    assert.equal(timingSafeEqualHex(a, b), true);
  });

  test("false for different hashes", () => {
    const a = hashToken("one");
    const b = hashToken("two");
    assert.equal(timingSafeEqualHex(a, b), false);
  });

  test("false for unequal lengths (never throws)", () => {
    assert.equal(timingSafeEqualHex("abcd", "abcdef"), false);
  });

  test("false for empty strings", () => {
    assert.equal(timingSafeEqualHex("", ""), false);
  });

  test("false when either input is not a string", () => {
    // @ts-expect-error runtime guard
    assert.equal(timingSafeEqualHex(null, "abcd"), false);
    // @ts-expect-error runtime guard
    assert.equal(timingSafeEqualHex("abcd", undefined), false);
  });

  test("false for malformed hex (parses to empty buffer)", () => {
    // Two 4-char strings but not hex — Buffer.from produces empty buffers.
    assert.equal(timingSafeEqualHex("zzzz", "zzzz"), false);
  });
});
