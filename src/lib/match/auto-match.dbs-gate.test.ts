import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Structural guard for the A4 DBS gate. This test ensures nobody
// silently removes the v_agency_opt_in_gates filter from auto-match.
// (A behavioural test would require a full Supabase stub; the pure
// decision logic for the allocation-protection side is covered in
// src/app/api/cron/dbs-change-allocations/protection.test.ts.)
describe("auto-match A4 DBS gate — structural guard", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "auto-match.ts"),
    "utf8",
  );

  it("consults v_agency_opt_in_gates before selecting caregiver profiles for eligibility", () => {
    const idxGate = source.indexOf('"v_agency_opt_in_gates"');
    // There are two caregiver_profiles reads: one is a fallback pool
    // builder (published carers when no geographic origin) and one is
    // the eligibility read that must be gated. Match the eligibility
    // read specifically — it selects `services, rating_avg, is_online`.
    const idxEligibilityRead = source.indexOf(
      "user_id, services, rating_avg",
    );
    assert.ok(idxGate > -1, "v_agency_opt_in_gates lookup missing");
    assert.ok(idxEligibilityRead > -1, "eligibility caregiver_profiles read missing");
    assert.ok(
      idxGate < idxEligibilityRead,
      "DBS gate must be checked BEFORE the caregiver_profiles eligibility read",
    );
  });

  it("filters dbs_ok = true", () => {
    assert.match(source, /\.eq\(\s*["']dbs_ok["']\s*,\s*true\s*\)/);
  });

  it("fails closed on gate query error", () => {
    // The gate handler must return { offers: [], poolSize: poolIds.length }
    // when the view read errors. Check the shape is present.
    assert.match(
      source,
      /if\s*\(\s*gatedErr\s*\)\s*\{[^}]*return\s*\{\s*offers:\s*\[\][^}]*poolSize/,
    );
  });

  it("passes dbsFilteredPoolIds (not poolIds) to the caregiver_profiles eligibility read", () => {
    // Locate the eligibility block by its distinctive select column list.
    const idxEligibilityRead = source.indexOf(
      "user_id, services, rating_avg",
    );
    // Take a window around the eligibility read.
    const eligibilityBlock = source.slice(
      Math.max(0, idxEligibilityRead - 200),
      idxEligibilityRead + 400,
    );
    assert.match(
      eligibilityBlock,
      /\.in\(\s*["']user_id["']\s*,\s*dbsFilteredPoolIds\s*\)/,
      "eligibility caregiver_profiles read must use dbsFilteredPoolIds",
    );
  });
});
