/**
 * Regression test for PR #175 review finding: honeypot was checked
 * BEFORE rate-limiting in both B2B lead routes, so every bot hit an
 * un-throttled `spam_lead_attempts` DB insert. Fixed by moving the
 * rate-limit check first in both routes.
 *
 * Two things are asserted:
 *  1. The shared `rateLimit()` primitive itself blocks the 4th
 *     request/hour from the same key (limit: 3) — this is the actual
 *     runtime behaviour both routes rely on.
 *  2. A source-order check on both route files: the `rateLimit(` call
 *     must appear before the honeypot check (`body.website` /
 *     `website.length`) in the compiled source. This is a cheap,
 *     dependency-free way to pin the ordering without standing up a
 *     full Next.js request/Supabase test harness for routes that are
 *     not currently extracted into pure handlers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rateLimit } from "@/lib/rate-limit";

test("rateLimit blocks the 4th request/hour from the same key (limit: 3)", () => {
  const key = `test-org-leads:${Math.random().toString(36).slice(2)}`;
  assert.equal(rateLimit(key, { limit: 3, windowMs: 60 * 60 * 1000 }), true, "1st allowed");
  assert.equal(rateLimit(key, { limit: 3, windowMs: 60 * 60 * 1000 }), true, "2nd allowed");
  assert.equal(rateLimit(key, { limit: 3, windowMs: 60 * 60 * 1000 }), true, "3rd allowed");
  assert.equal(rateLimit(key, { limit: 3, windowMs: 60 * 60 * 1000 }), false, "4th blocked");
});

function assertRateLimitBeforeHoneypot(relativePath: string) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const filePath = path.resolve(here, relativePath);
  const src = readFileSync(filePath, "utf8");

  const rateLimitIdx = src.indexOf("rateLimit(");
  const honeypotIdx = src.search(/body\.website|website\.length/);

  assert.notEqual(rateLimitIdx, -1, `expected to find rateLimit( call in ${relativePath}`);
  assert.notEqual(honeypotIdx, -1, `expected to find honeypot check in ${relativePath}`);
  assert.ok(
    rateLimitIdx < honeypotIdx,
    `expected rate-limit check to run before honeypot check in ${relativePath}`,
  );
}

test("org-leads route checks rate limit before the honeypot", () => {
  assertRateLimitBeforeHoneypot("./route.ts");
});

test("employers/lead route checks rate limit before the honeypot", () => {
  assertRateLimitBeforeHoneypot("../../employers/lead/route.ts");
});
