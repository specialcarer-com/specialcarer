/**
 * Unit test for the per-user 2FA verify rate limit (gap 13): 5 attempts/min,
 * the 6th is blocked. Each test uses a unique user id so the process-global
 * counter doesn't bleed across cases.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { check2faRateLimit } from "./rate-limit";

test("allows 5 attempts then blocks the 6th within the window", () => {
  const user = `u-${Math.random().toString(36).slice(2)}`;
  for (let i = 1; i <= 5; i++) {
    assert.equal(check2faRateLimit("challenge", user), true, `attempt ${i} allowed`);
  }
  assert.equal(check2faRateLimit("challenge", user), false, "6th attempt blocked");
});

test("different actions get independent budgets for the same user", () => {
  const user = `u-${Math.random().toString(36).slice(2)}`;
  for (let i = 0; i < 5; i++) check2faRateLimit("challenge", user);
  // challenge is now exhausted, but disable has its own budget.
  assert.equal(check2faRateLimit("challenge", user), false);
  assert.equal(check2faRateLimit("disable", user), true);
});

test("different users get independent budgets for the same action", () => {
  const a = `a-${Math.random().toString(36).slice(2)}`;
  const b = `b-${Math.random().toString(36).slice(2)}`;
  for (let i = 0; i < 5; i++) check2faRateLimit("enrol-verify", a);
  assert.equal(check2faRateLimit("enrol-verify", a), false);
  assert.equal(check2faRateLimit("enrol-verify", b), true);
});
