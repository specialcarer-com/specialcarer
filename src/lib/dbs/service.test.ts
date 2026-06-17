/**
 * Unit + integration tests for the DBS service layer (PR-DBS-1).
 *
 *  - computeOverall: pure roll-up truth table.
 *  - initiate + submit round-trip: driven against the MockDbsVendor and an
 *    in-memory fake of the Supabase admin client (injected via
 *    setDbsAdminClientFactory).
 *
 * NEXT_PUBLIC_DBS_ENABLED is forced on for this file so the write paths run.
 */
process.env.NEXT_PUBLIC_DBS_ENABLED = "true";
process.env.DBS_VENDOR = "mock";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  computeOverall,
  initiateDbsApplications,
  submitDbsApplication,
  recomputeOverallStatus,
  recordManualDecision,
  setDbsAdminClientFactory,
} from "./service";
import { getMockDbsVendor } from "./vendor";

// ── computeOverall truth table ───────────────────────────────────────────────

describe("computeOverall", () => {
  it("not_started when neither side started", () => {
    assert.deepEqual(computeOverall(null, null), {
      overall: "not_started",
      searchEligible: false,
    });
    assert.deepEqual(computeOverall("not_started", "not_started"), {
      overall: "not_started",
      searchEligible: false,
    });
  });

  it("approved + search eligible only when BOTH approved", () => {
    assert.deepEqual(computeOverall("approved", "approved"), {
      overall: "approved",
      searchEligible: true,
    });
  });

  it("in_progress when only one side approved", () => {
    assert.deepEqual(computeOverall("approved", "submitted"), {
      overall: "in_progress",
      searchEligible: false,
    });
    assert.deepEqual(computeOverall("approved", null), {
      overall: "in_progress",
      searchEligible: false,
    });
  });

  it("rejected (and never eligible) if either side rejected", () => {
    assert.deepEqual(computeOverall("rejected", "approved"), {
      overall: "rejected",
      searchEligible: false,
    });
    assert.deepEqual(computeOverall("approved", "rejected"), {
      overall: "rejected",
      searchEligible: false,
    });
  });

  it("expired when a side expired and nothing rejected", () => {
    assert.deepEqual(computeOverall("expired", "approved"), {
      overall: "expired",
      searchEligible: false,
    });
  });

  it("in_progress while submitted/in_progress", () => {
    assert.deepEqual(computeOverall("submitted", "in_progress"), {
      overall: "in_progress",
      searchEligible: false,
    });
  });
});

// ── In-memory fake Supabase admin client ─────────────────────────────────────

type Row = Record<string, unknown>;

class FakeTable {
  constructor(public rows: Row[]) {}
}

class FakeDb {
  tables: Record<string, FakeTable> = {
    dbs_applications: new FakeTable([]),
    caregiver_profiles: new FakeTable([{ user_id: "carer-1" }]),
  };

  reset() {
    this.tables = {
      dbs_applications: new FakeTable([]),
      caregiver_profiles: new FakeTable([{ user_id: "carer-1" }]),
    };
  }
}

// A tiny query builder covering exactly the operations the service uses:
//   select().eq()[.eq()][.maybeSingle()] · insert() · update().eq()[.in()]
function makeClient(db: FakeDb) {
  return {
    from(table: string) {
      const t = () => db.tables[table];
      return {
        _filters: [] as Array<[string, unknown]>,
        select(_cols?: string) {
          const self = this;
          const builder = {
            _f: [] as Array<[string, unknown]>,
            eq(col: string, val: unknown) {
              this._f.push([col, val]);
              return this;
            },
            in(col: string, vals: unknown[]) {
              this._f.push([col, { __in: vals }]);
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this.__resolve();
            },
            async maybeSingle() {
              const rows = this.__match();
              return { data: rows[0] ?? null, error: null };
            },
            __match() {
              return t().rows.filter((r) =>
                this._f.every(([c, v]) =>
                  v && typeof v === "object" && "__in" in v
                    ? (v as { __in: unknown[] }).__in.includes(r[c])
                    : r[c] === v,
                ),
              );
            },
            __resolve() {
              return Promise.resolve({ data: this.__match(), error: null });
            },
            then(resolve: (x: { data: Row[]; error: null }) => void) {
              return this.__resolve().then(resolve);
            },
          };
          void self;
          return builder;
        },
        async insert(payload: Row | Row[]) {
          const arr = Array.isArray(payload) ? payload : [payload];
          for (const p of arr) {
            t().rows.push({ id: `app-${t().rows.length + 1}`, ...p });
          }
          return { data: null, error: null };
        },
        update(patch: Row) {
          const f: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) {
              f.push([col, val]);
              return this;
            },
            in(col: string, vals: unknown[]) {
              f.push([col, { __in: vals }]);
              return this;
            },
            __apply() {
              for (const r of t().rows) {
                const ok = f.every(([c, v]) =>
                  v && typeof v === "object" && "__in" in v
                    ? (v as { __in: unknown[] }).__in.includes(r[c])
                    : r[c] === v,
                );
                if (ok) Object.assign(r, patch);
              }
              return { data: null, error: null };
            },
            then(resolve: (x: { data: null; error: null }) => void) {
              return Promise.resolve(this.__apply()).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  };
}

describe("initiate + submit round trip (MockDbsVendor + fake DB)", () => {
  const db = new FakeDb();

  beforeEach(() => {
    db.reset();
    getMockDbsVendor().reset();
    setDbsAdminClientFactory(() => makeClient(db) as never);
  });

  it("initiate creates adult + child rows and marks overall in_progress", async () => {
    await initiateDbsApplications("carer-1");
    const apps = db.tables.dbs_applications.rows;
    assert.equal(apps.length, 2);
    assert.deepEqual(
      apps.map((a) => a.kind).sort(),
      ["adult", "child"],
    );
    assert.ok(apps.every((a) => a.status === "not_started"));
    const profile = db.tables.caregiver_profiles.rows[0];
    assert.equal(profile.dbs_overall_status, "in_progress");
    assert.equal(profile.dbs_search_eligible, false);
  });

  it("initiate is idempotent (no duplicate rows)", async () => {
    await initiateDbsApplications("carer-1");
    await initiateDbsApplications("carer-1");
    assert.equal(db.tables.dbs_applications.rows.length, 2);
  });

  it("submit flips the row to submitted with a vendor reference", async () => {
    await initiateDbsApplications("carer-1");
    const { vendorReference } = await submitDbsApplication("carer-1", "adult", {
      legalName: "Alex Carer",
      dateOfBirth: "1990-01-01",
      surname: "Carer",
    });
    assert.ok(vendorReference.startsWith("mock-adult"));
    const adult = db.tables.dbs_applications.rows.find((r) => r.kind === "adult");
    assert.equal(adult?.status, "submitted");
    assert.equal(adult?.vendor_reference, vendorReference);
    assert.ok(adult?.submitted_at);
  });

  it("becomes search-eligible only after BOTH are approved", async () => {
    await initiateDbsApplications("carer-1");
    await submitDbsApplication("carer-1", "adult", {
      legalName: "A",
      dateOfBirth: "1990-01-01",
      surname: "Carer",
    });
    await submitDbsApplication("carer-1", "child", {
      legalName: "A",
      dateOfBirth: "1990-01-01",
      surname: "Carer",
    });

    const adultId = db.tables.dbs_applications.rows.find(
      (r) => r.kind === "adult",
    )!.id as string;
    const childId = db.tables.dbs_applications.rows.find(
      (r) => r.kind === "child",
    )!.id as string;

    await recordManualDecision(adultId, "approved", "admin-1", "001234567890");
    let profile = db.tables.caregiver_profiles.rows[0];
    assert.equal(profile.dbs_search_eligible, false, "one approval is not enough");
    assert.equal(profile.dbs_overall_status, "in_progress");

    await recordManualDecision(childId, "approved", "admin-1", "009876543210");
    profile = db.tables.caregiver_profiles.rows[0];
    assert.equal(profile.dbs_search_eligible, true);
    assert.equal(profile.dbs_overall_status, "approved");
  });

  it("a rejection blocks eligibility and sets overall rejected", async () => {
    await initiateDbsApplications("carer-1");
    await submitDbsApplication("carer-1", "adult", {
      legalName: "A",
      dateOfBirth: "1990-01-01",
      surname: "Carer",
    });
    const adultId = db.tables.dbs_applications.rows.find(
      (r) => r.kind === "adult",
    )!.id as string;
    await recordManualDecision(adultId, "rejected", "admin-1");
    const result = await recomputeOverallStatus("carer-1");
    assert.equal(result.overall, "rejected");
    assert.equal(result.searchEligible, false);
  });
});
