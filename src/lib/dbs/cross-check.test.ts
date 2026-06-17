/**
 * Unit tests for the DBS ↔ Veriff cross-check (PR-DBS-2).
 * NEXT_PUBLIC_DBS_ENABLED is forced on so the DB-backed path runs.
 */
process.env.NEXT_PUBLIC_DBS_ENABLED = "true";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  compareIdentities,
  veriffFactsFromDecision,
  crossCheckDbsAgainstVeriff,
  setCrossCheckAdminClientFactory,
} from "./cross-check";

// ── compareIdentities (pure) ─────────────────────────────────────────────────

describe("compareIdentities", () => {
  const veriff = { surname: "Smith", dateOfBirth: "1990-01-01" };

  it("passes on exact (case-insensitive) match", () => {
    const r = compareIdentities(
      { surname: "smith", dateOfBirth: "1990-01-01" },
      veriff,
    );
    assert.deepEqual(r, { ok: true, mismatches: [], overridden: false });
  });

  it("flags a surname mismatch", () => {
    const r = compareIdentities(
      { surname: "Jones", dateOfBirth: "1990-01-01" },
      veriff,
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.mismatches, ["surname"]);
  });

  it("flags a DOB mismatch", () => {
    const r = compareIdentities(
      { surname: "Smith", dateOfBirth: "1991-01-01" },
      veriff,
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.mismatches, ["dob"]);
  });

  it("an override clears a surname-only mismatch", () => {
    const r = compareIdentities(
      { surname: "Smith-Jones", dateOfBirth: "1990-01-01" },
      veriff,
      true,
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.mismatches, ["surname"]);
    assert.equal(r.overridden, true);
  });

  it("an override does NOT clear a DOB mismatch", () => {
    const r = compareIdentities(
      { surname: "Smith", dateOfBirth: "1991-01-01" },
      veriff,
      true,
    );
    assert.equal(r.ok, false);
  });
});

describe("veriffFactsFromDecision", () => {
  it("extracts surname + dob from a decision payload", () => {
    const facts = veriffFactsFromDecision({
      verification: { person: { lastName: "Smith", dateOfBirth: "1990-01-01" } },
    });
    assert.deepEqual(facts, { surname: "Smith", dateOfBirth: "1990-01-01" });
  });

  it("returns empty facts for a malformed payload", () => {
    assert.deepEqual(veriffFactsFromDecision(null), {});
    assert.deepEqual(veriffFactsFromDecision({ nope: 1 }), {
      surname: null,
      dateOfBirth: null,
    });
  });
});

// ── crossCheckDbsAgainstVeriff (DB-backed, fake client) ──────────────────────

type Row = Record<string, unknown>;

function makeClient(state: {
  identity: Row[];
  applications: Row[];
  caregivers?: Row[];
}) {
  // GB carer for every application by default, so region gating is satisfied
  // unless a test overrides state.caregivers.
  const caregivers = () =>
    state.caregivers ?? [{ user_id: "c1", country: "GB" }];
  return {
    from(table: string) {
      const rows = () =>
        table === "identity_verifications"
          ? state.identity
          : table === "caregiver_profiles"
            ? caregivers()
            : state.applications;
      const filters: Array<(r: Row) => boolean> = [];
      // A dotted column like "caregiver_profiles.country" models an !inner join:
      // read the value from the caregiver_profiles row whose user_id matches the
      // application's carer_id (no join row ⇒ excluded, mirroring an inner join).
      const matches = (r: Row, col: string, val: unknown): boolean => {
        if (col.includes(".")) {
          const [, joinCol] = col.split(".");
          const joined = caregivers().find((cp) => cp.user_id === r.carer_id);
          return joined ? joined[joinCol] === val : false;
        }
        return r[col] === val;
      };
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => matches(r, col, val));
          return builder;
        },
        not(col: string, _op: string, _val: unknown) {
          filters.push((r) => r[col] !== null && r[col] !== undefined);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async maybeSingle() {
          const m = rows().filter((r) => filters.every((f) => f(r)));
          return { data: m[0] ?? null, error: null };
        },
        then(resolve: (x: { data: Row[]; error: null }) => void) {
          const m = rows().filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: m, error: null }).then(resolve);
        },
        update(patch: Row) {
          const updFilters: Array<(r: Row) => boolean> = [];
          const upd = {
            eq(col: string, val: unknown) {
              updFilters.push((r) => r[col] === val);
              return upd;
            },
            then(resolve: (x: { data: null; error: null }) => void) {
              for (const r of rows()) {
                if (updFilters.every((f) => f(r))) Object.assign(r, patch);
              }
              return Promise.resolve({ data: null, error: null }).then(resolve);
            },
          };
          return upd;
        },
      };
      return builder;
    },
  };
}

describe("crossCheckDbsAgainstVeriff", () => {
  beforeEach(() => {
    setCrossCheckAdminClientFactory(null);
  });

  it("passes (no-op) when the carer has no approved Veriff verification", async () => {
    const state = {
      identity: [] as Row[],
      applications: [{ id: "a1", carer_id: "c1", kind: "adult" }] as Row[],
    };
    setCrossCheckAdminClientFactory(() => makeClient(state) as never);
    const r = await crossCheckDbsAgainstVeriff("c1", {
      surname: "Smith",
      dateOfBirth: "1990-01-01",
    });
    assert.equal(r.ok, true);
    assert.equal(state.applications[0].cross_check_passed, true);
  });

  it("fails on a surname mismatch and persists the result", async () => {
    const state = {
      identity: [
        {
          user_id: "c1",
          status: "approved",
          updated_at: "2026-01-01",
          decision_json: {
            verification: {
              person: { lastName: "Smith", dateOfBirth: "1990-01-01" },
            },
          },
        },
      ] as Row[],
      applications: [
        { id: "a1", carer_id: "c1", kind: "adult", surname_override_by: null },
      ] as Row[],
    };
    setCrossCheckAdminClientFactory(() => makeClient(state) as never);
    const r = await crossCheckDbsAgainstVeriff("c1", {
      surname: "Jones",
      dateOfBirth: "1990-01-01",
    });
    assert.equal(r.ok, false);
    assert.deepEqual(r.mismatches, ["surname"]);
    assert.equal(state.applications[0].cross_check_passed, false);
  });

  it("passes a surname mismatch when an admin override exists", async () => {
    const state = {
      identity: [
        {
          user_id: "c1",
          status: "approved",
          updated_at: "2026-01-01",
          decision_json: {
            verification: {
              person: { lastName: "Smith", dateOfBirth: "1990-01-01" },
            },
          },
        },
      ] as Row[],
      applications: [
        {
          id: "a1",
          carer_id: "c1",
          kind: "adult",
          surname_override_by: "admin-1",
        },
      ] as Row[],
    };
    setCrossCheckAdminClientFactory(() => makeClient(state) as never);
    const r = await crossCheckDbsAgainstVeriff("c1", {
      surname: "Smith-Jones",
      dateOfBirth: "1990-01-01",
    });
    assert.equal(r.ok, true);
    assert.equal(r.overridden, true);
  });
});
