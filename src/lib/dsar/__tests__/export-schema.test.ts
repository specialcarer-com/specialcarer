/**
 * DSAR exporter — schema drift regression guard.
 *
 * On 17 Sep 2026 the production DSAR exporter was found to have
 * silently drifted from the live database schema: eight of the eleven
 * enumerated tables returned an `error` string in the manifest with
 * `row_count: 0`, meaning subjects were receiving legally deficient
 * exports (UK-GDPR Article 15). See
 * `/home/user/workspace/phase_f/dsar_exporter_schema_drift_17sep.md`.
 *
 * These two tests are intentionally narrow — they don't inspect row
 * contents, only that every table the exporter tries to read has a
 * matching shape (no `error` field) and that the version string is
 * bumped so downstream consumers can tell a repaired export apart
 * from a broken one.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { exportSubject, DSAR_TABLES, type ExportAdminClient } from "../export";

// Minimal columns each table needs to expose so the exporter's
// booking-linked lookups (care_plans / payments / refund_ledger)
// find something to enumerate. The values only need to be shaped
// right; the fake client below doesn't actually filter.
const SEEDED_ROWS: Record<string, unknown[]> = {
  profiles: [{ id: "sub-1", email: "sub@example.com" }],
  caregiver_profiles: [{ user_id: "sub-1", verified: true }],
  bookings: [{ id: "bk-1", seeker_id: "sub-1", caregiver_id: "sub-1" }],
  carer_references: [{ id: "ref-1", carer_id: "sub-1" }],
  compliance_documents: [{ id: "doc-1", caregiver_id: "sub-1" }],
  dbs_change_events: [{ id: "dbs-1", carer_id: "sub-1" }],
  reviews: [{ id: "rev-1", reviewer_id: "sub-1", caregiver_id: "sub-1" }],
  saved_caregivers: [{ id: "sav-1", seeker_id: "sub-1" }],
  care_plans: [{ id: "cp-1", booking_id: "bk-1" }],
  payments: [{ id: "pay-1", booking_id: "bk-1", amount_cents: 5000 }],
  refund_ledger: [{ id: "rl-1", booking_id: "bk-1", amount_cents: 1000 }],
};

/**
 * Fake Supabase admin that returns the seeded rows for any known
 * table, or a Postgres 42P01 "relation does not exist" error for
 * unknown tables. If the exporter references a table not seeded
 * here, the test will surface it as an `error` on that entry and
 * the assertion below will fail — which is exactly the drift the
 * test is guarding against.
 */
function makeSeededAdmin(): ExportAdminClient {
  const respond = (table: string) => {
    if (!(table in SEEDED_ROWS)) {
      return {
        data: null,
        error: { code: "42P01", message: `relation "${table}" does not exist` },
      };
    }
    return { data: SEEDED_ROWS[table], error: null };
  };
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            async eq(_column: string, _value: string) {
              return respond(table);
            },
            async or(_filter: string) {
              return respond(table);
            },
          };
        },
      };
    },
  };
}

describe("DSAR exporter — schema drift regression", () => {
  const subject = { user_id: "sub-1", email: "sub@example.com" };

  it("every table query resolves against current schema — no error field", async () => {
    // Sanity check first: the manifest must cover every table this
    // test knows about. If a new table is added to DSAR_TABLES
    // without a fixture entry, the check below would silently pass
    // by falling through to the 42P01 branch.
    const declared = new Set<string>(DSAR_TABLES.map((t) => t.table));
    // Booking-linked lookups aren't in DSAR_TABLES but ARE enumerated.
    declared.add("care_plans");
    declared.add("payments");
    for (const table of declared) {
      assert.ok(
        table in SEEDED_ROWS,
        `Test fixture missing seed for ${table}; add to SEEDED_ROWS or the drift guard won't cover it.`,
      );
    }

    const doc = await exportSubject(makeSeededAdmin(), subject);

    const withError = doc.tables.filter((t) => t.error !== undefined);
    assert.deepEqual(
      withError.map((t) => ({ table: t.table, error: t.error })),
      [],
      "no table should return an error against a schema-aligned client",
    );
    // And every table should have gone through the read path (never
    // an untouched entry with row_count > 0 by mistake).
    for (const entry of doc.tables) {
      assert.ok(
        typeof entry.row_count === "number",
        `table ${entry.table} missing row_count`,
      );
    }
  });

  it("exporter version is 1.1.0", async () => {
    const doc = await exportSubject(makeSeededAdmin(), subject);
    assert.equal(doc.subject.exporter_version, "dsar-export/1.1.0");
  });
});
