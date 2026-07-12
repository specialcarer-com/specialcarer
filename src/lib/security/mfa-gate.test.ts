/**
 * Unit tests for admin MFA gate decisions (Sprint 2.1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAal2Satisfied,
  needsMfaChallenge,
  resolveAdminMfaGate,
  sanitiseTotpCode,
} from "./mfa-gate";

test("non-admin users are never forced through admin MFA gate", () => {
  assert.deepEqual(
    resolveAdminMfaGate({
      isAdmin: false,
      hasVerifiedTotp: false,
      aal: { currentLevel: "aal1", nextLevel: "aal1" },
    }),
    { status: "allow" },
  );
});

test("admin with no TOTP factor is redirected to setup", () => {
  assert.deepEqual(
    resolveAdminMfaGate({
      isAdmin: true,
      hasVerifiedTotp: false,
      aal: { currentLevel: "aal1", nextLevel: "aal1" },
    }),
    { status: "setup_required" },
  );
});

test("admin with factor and aal1 is redirected to challenge", () => {
  assert.deepEqual(
    resolveAdminMfaGate({
      isAdmin: true,
      hasVerifiedTotp: true,
      aal: { currentLevel: "aal1", nextLevel: "aal2" },
    }),
    { status: "challenge_required" },
  );
});

test("admin with factor and aal2 can access admin", () => {
  assert.deepEqual(
    resolveAdminMfaGate({
      isAdmin: true,
      hasVerifiedTotp: true,
      aal: { currentLevel: "aal2", nextLevel: "aal2" },
    }),
    { status: "allow" },
  );
});

test("needsMfaChallenge detects step-up requirement", () => {
  assert.equal(
    needsMfaChallenge({ currentLevel: "aal1", nextLevel: "aal2" }),
    true,
  );
  assert.equal(
    needsMfaChallenge({ currentLevel: "aal2", nextLevel: "aal2" }),
    false,
  );
});

test("isAal2Satisfied requires currentLevel aal2", () => {
  assert.equal(isAal2Satisfied({ currentLevel: "aal2", nextLevel: "aal2" }), true);
  assert.equal(isAal2Satisfied({ currentLevel: "aal1", nextLevel: "aal2" }), false);
});

test("sanitiseTotpCode accepts 6 digits only", () => {
  assert.equal(sanitiseTotpCode("123456"), "123456");
  assert.equal(sanitiseTotpCode(" 123 456 "), "123456");
  assert.equal(sanitiseTotpCode("12345"), null);
  assert.equal(sanitiseTotpCode("abcdef"), null);
});
