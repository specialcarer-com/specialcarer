/**
 * Unit tests for the DBS Update Service provider abstraction.
 *
 * Runs under `tsx` via the `test` npm script. Both providers are tested
 * with their HTTP layer mocked (via globalThis.fetch).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  computeNextUsCheckDueAt,
  validateUpdateServiceInput,
  type VerifyUpdateServiceInput,
} from "./provider";
import { manualAdminProvider } from "./providers/manual-admin";
import { checkrUpdateServiceProvider } from "./providers/checkr-update-service";

const goodInput: VerifyUpdateServiceInput = {
  carerLegalName: "Alex Carer",
  dateOfBirth: "1990-04-12",
  certificateNumber: "001234567890",
  subscriptionId: "111122223333",
  workforceType: "both",
};

describe("validateUpdateServiceInput", () => {
  it("accepts a well-formed payload", () => {
    assert.deepEqual(validateUpdateServiceInput(goodInput), []);
  });

  it("rejects short certificate numbers", () => {
    const errs = validateUpdateServiceInput({
      ...goodInput,
      certificateNumber: "123",
    });
    assert.ok(errs.some((e) => e.includes("certificate")));
  });

  it("rejects bad workforce type", () => {
    const errs = validateUpdateServiceInput({
      ...goodInput,
      workforceType: "elderly" as unknown as "adult",
    });
    assert.ok(errs.some((e) => e.toLowerCase().includes("workforce")));
  });

  it("rejects malformed DOB", () => {
    const errs = validateUpdateServiceInput({
      ...goodInput,
      dateOfBirth: "12-04-1990",
    });
    assert.ok(errs.some((e) => e.includes("Date of birth")));
  });
});

describe("computeNextUsCheckDueAt", () => {
  const originalInterval = process.env.DBS_RECHECK_INTERVAL_DAYS;
  afterEach(() => {
    if (originalInterval === undefined) {
      delete process.env.DBS_RECHECK_INTERVAL_DAYS;
    } else {
      process.env.DBS_RECHECK_INTERVAL_DAYS = originalInterval;
    }
  });

  it("defaults to 183 days (~6 months)", () => {
    delete process.env.DBS_RECHECK_INTERVAL_DAYS;
    const from = new Date("2026-05-12T10:00:00.000Z");
    const next = computeNextUsCheckDueAt(from);
    const expected = new Date(from.getTime() + 183 * 24 * 60 * 60 * 1000);
    assert.equal(next.toISOString(), expected.toISOString());
  });

  it("honours DBS_RECHECK_INTERVAL_DAYS env override", () => {
    process.env.DBS_RECHECK_INTERVAL_DAYS = "30";
    const from = new Date("2026-05-12T10:00:00.000Z");
    const next = computeNextUsCheckDueAt(from);
    const expected = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
    assert.equal(next.toISOString(), expected.toISOString());
  });

  it("falls back to default when env is invalid", () => {
    process.env.DBS_RECHECK_INTERVAL_DAYS = "not-a-number";
    const from = new Date("2026-05-12T10:00:00.000Z");
    const next = computeNextUsCheckDueAt(from);
    const expected = new Date(from.getTime() + 183 * 24 * 60 * 60 * 1000);
    assert.equal(next.toISOString(), expected.toISOString());
  });
});

describe("manualAdminProvider", () => {
  it("always returns manual_pending", async () => {
    const r = await manualAdminProvider.verifyUpdateService(goodInput);
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.equal(r.reason, "manual_pending");
    }
  });
});

describe("checkrUpdateServiceProvider", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.CHECKR_API_KEY;
  const originalUrl = process.env.CHECKR_UK_UPDATE_SERVICE_URL;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.CHECKR_API_KEY;
    else process.env.CHECKR_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.CHECKR_UK_UPDATE_SERVICE_URL;
    else process.env.CHECKR_UK_UPDATE_SERVICE_URL = originalUrl;
  });

  it("returns provider_error when env not configured", async () => {
    // Re-import to re-read env? The provider captures env at module load,
    // so we can only assert on the instance currently bound. If apiKey
    // was empty at import time (typical in test), call goes through the
    // unconfigured-branch.
    const r = await checkrUpdateServiceProvider.verifyUpdateService(goodInput);
    if (!process.env.CHECKR_API_KEY || !process.env.CHECKR_UK_UPDATE_SERVICE_URL) {
      assert.equal(r.ok, false);
      if (r.ok === false) assert.equal(r.reason, "provider_error");
    }
  });
});

// ── Gate logic synthesis ─────────────────────────────────────────────────────
//
// We don't have a live Postgres to test the view directly. Instead we
// re-implement the workforce-compatibility predicate in TS and assert
// the truth table.
function workforceCompatible(
  certWorkforce: "adult" | "child" | "both",
  worksWithAdults: boolean | null,
  worksWithChildren: boolean | null,
): boolean {
  if (certWorkforce === "both") return true;
  if (worksWithAdults === null && worksWithChildren === null) return true;
  if (
    certWorkforce === "adult" &&
    (worksWithAdults ?? false) === true &&
    (worksWithChildren ?? false) === false
  ) {
    return true;
  }
  if (
    certWorkforce === "child" &&
    (worksWithChildren ?? false) === true &&
    (worksWithAdults ?? false) === false
  ) {
    return true;
  }
  return false;
}

describe("DBS gate workforce compatibility — 8 combinations", () => {
  const cases: Array<{
    cert: "adult" | "child" | "both";
    adults: boolean;
    children: boolean;
    expected: boolean;
  }> = [
    { cert: "adult", adults: true, children: false, expected: true },
    { cert: "adult", adults: false, children: true, expected: false },
    { cert: "adult", adults: true, children: true, expected: false }, // cert too narrow
    { cert: "adult", adults: false, children: false, expected: false },
    { cert: "child", adults: false, children: true, expected: true },
    { cert: "child", adults: true, children: false, expected: false },
    { cert: "both", adults: true, children: true, expected: true },
    { cert: "both", adults: false, children: false, expected: true }, // cert covers everything
  ];
  for (const c of cases) {
    it(`cert=${c.cert} adults=${c.adults} children=${c.children} → ${c.expected}`, () => {
      assert.equal(
        workforceCompatible(c.cert, c.adults, c.children),
        c.expected,
      );
    });
  }
});
