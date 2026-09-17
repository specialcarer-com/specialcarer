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

  it("exporter version is 1.2.0", async () => {
    const doc = await exportSubject(makeSeededAdmin(), subject);
    assert.equal(doc.subject.exporter_version, "dsar-export/1.2.0");
  });
});

/**
 * Role-aware projection guards — v1.2.0.
 *
 * Care plans and payments straddle two parties (seeker and carer)
 * whereas UK-GDPR Article 15 only entitles the subject to *their own*
 * personal data. The tests below seed a booking where the subject
 * takes exactly one role and check that the exported row exposes
 * only the fields attributable to that role.
 */

// A fake admin that lets each test tailor the rows returned per
// table without also having to open-code the eq/or PostgREST surface.
// `payments` and `care_plans` also record the `select` column string
// so a test can assert which projection was applied.
function makeAdminFromRows(
  rows: Record<string, unknown[]>,
  captures?: { columnsByTable: Record<string, string[]> },
): ExportAdminClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          if (captures) {
            captures.columnsByTable[table] =
              captures.columnsByTable[table] ?? [];
            captures.columnsByTable[table].push(columns);
          }
          const respond = () => {
            if (!(table in rows)) {
              return {
                data: null,
                error: {
                  code: "42P01",
                  message: `relation "${table}" does not exist`,
                },
              };
            }
            return { data: rows[table], error: null };
          };
          return {
            async eq(_c: string, _v: string) {
              return respond();
            },
            async or(_f: string) {
              return respond();
            },
          };
        },
      };
    },
  };
}

describe("DSAR exporter — role-aware projections (v1.2.0)", () => {
  const SUBJECT_ID = "sub-1";
  const OTHER_ID = "other-1";
  const subject = { user_id: SUBJECT_ID, email: "sub@example.com" };

  // Every row a care_plan might carry; the exporter's job is to
  // redact the ones that identify the recipient when the subject is
  // the carer, not the seeker.
  const fullCarePlanRow = {
    id: "cp-1",
    booking_id: "bk-1",
    recipient_name: "Aunt Mabel",
    recipient_dob: "1942-03-17",
    address_line1: "1 Elm Street",
    address_line2: "Flat B",
    city: "Bristol",
    postcode: "BS1 1AA",
    goals: "Support with mobility",
    special_instructions: "Coffee, no sugar",
    routine_notes: "Prefers morning visits",
    created_by: OTHER_ID,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  // Every payment field we care about for role-awareness. Seeker gets
  // payer-side (`stripe_payment_intent_id`, `stripe_charge_id`,
  // `hsa_*`), carer gets payee-side (`stripe_transfer_id`,
  // `destination_account_id`), neither gets `application_fee_cents`.
  const fullPaymentRow = {
    id: "pay-1",
    booking_id: "bk-1",
    stripe_payment_intent_id: "pi_test",
    stripe_charge_id: "ch_test",
    stripe_transfer_id: "tr_test",
    destination_account_id: "acct_test",
    status: "succeeded",
    amount_cents: 5000,
    application_fee_cents: 500,
    currency: "gbp",
    kind: "charge",
    parent_payment_id: null,
    timesheet_id: null,
    hsa_eligible: false,
    hsa_tagged_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  const baseFixture = {
    profiles: [{ id: SUBJECT_ID, email: subject.email }],
    caregiver_profiles: [],
    carer_references: [],
    compliance_documents: [],
    dbs_change_events: [],
    reviews: [],
    saved_caregivers: [],
    refund_ledger: [],
  };

  it("care_plans redacts recipient PII when subject is only the carer", async () => {
    // Subject is `caregiver_id`; someone else is the seeker.
    const rows = {
      ...baseFixture,
      bookings: [
        {
          id: "bk-1",
          seeker_id: OTHER_ID,
          caregiver_id: SUBJECT_ID,
        },
      ],
      care_plans: [fullCarePlanRow],
      payments: [],
    };
    const captures = { columnsByTable: {} as Record<string, string[]> };
    const admin = makeAdminFromRows(rows, captures);
    const doc = await exportSubject(admin, subject);

    // The carer-scoped projection must have been what we selected.
    const carePlanColumns = captures.columnsByTable.care_plans ?? [];
    assert.equal(
      carePlanColumns.length,
      1,
      "care_plans should be queried exactly once (carer scope only)",
    );
    const cols = carePlanColumns[0];
    assert.doesNotMatch(cols, /recipient_name/);
    assert.doesNotMatch(cols, /recipient_dob/);
    assert.doesNotMatch(cols, /address_line1/);
    assert.doesNotMatch(cols, /postcode/);
    assert.doesNotMatch(cols, /created_by/);
    assert.match(cols, /goals/);
    assert.match(cols, /special_instructions/);

    // And the fake echoes back whatever the fixture holds, so a
    // real Postgres would only return the requested columns. The
    // manifest entry still exists with the row present.
    const carePlansEntry = doc.tables.find((t) => t.table === "care_plans");
    assert.ok(carePlansEntry, "care_plans entry must appear in the manifest");
    assert.equal(carePlansEntry?.row_count, 1);
  });

  it("care_plans includes full recipient PII when subject is the seeker", async () => {
    // Subject is `seeker_id`; a different person is the carer.
    const rows = {
      ...baseFixture,
      bookings: [
        {
          id: "bk-1",
          seeker_id: SUBJECT_ID,
          caregiver_id: OTHER_ID,
        },
      ],
      care_plans: [fullCarePlanRow],
      payments: [],
    };
    const captures = { columnsByTable: {} as Record<string, string[]> };
    const admin = makeAdminFromRows(rows, captures);
    await exportSubject(admin, subject);

    const carePlanColumns = captures.columnsByTable.care_plans ?? [];
    assert.equal(
      carePlanColumns.length,
      1,
      "care_plans should be queried exactly once (seeker scope only)",
    );
    const cols = carePlanColumns[0];
    assert.match(cols, /recipient_name/);
    assert.match(cols, /recipient_dob/);
    assert.match(cols, /address_line1/);
    assert.match(cols, /postcode/);
    assert.match(cols, /goals/);
    assert.match(cols, /special_instructions/);
  });

  it("payments projects seeker-only fields when subject is the seeker", async () => {
    const rows = {
      ...baseFixture,
      bookings: [
        {
          id: "bk-1",
          seeker_id: SUBJECT_ID,
          caregiver_id: OTHER_ID,
        },
      ],
      care_plans: [],
      payments: [fullPaymentRow],
    };
    const captures = { columnsByTable: {} as Record<string, string[]> };
    const admin = makeAdminFromRows(rows, captures);
    await exportSubject(admin, subject);

    const paymentColumns = captures.columnsByTable.payments ?? [];
    assert.equal(
      paymentColumns.length,
      1,
      "payments should be queried exactly once (seeker scope only)",
    );
    const cols = paymentColumns[0];
    assert.match(cols, /stripe_payment_intent_id/);
    assert.match(cols, /stripe_charge_id/);
    assert.match(cols, /hsa_eligible/);
    assert.doesNotMatch(cols, /stripe_transfer_id/);
    assert.doesNotMatch(cols, /destination_account_id/);
    assert.doesNotMatch(cols, /application_fee_cents/);
  });

  it("payments projects caregiver-only fields when subject is the caregiver", async () => {
    const rows = {
      ...baseFixture,
      bookings: [
        {
          id: "bk-1",
          seeker_id: OTHER_ID,
          caregiver_id: SUBJECT_ID,
        },
      ],
      care_plans: [],
      payments: [fullPaymentRow],
    };
    const captures = { columnsByTable: {} as Record<string, string[]> };
    const admin = makeAdminFromRows(rows, captures);
    await exportSubject(admin, subject);

    const paymentColumns = captures.columnsByTable.payments ?? [];
    assert.equal(
      paymentColumns.length,
      1,
      "payments should be queried exactly once (carer scope only)",
    );
    const cols = paymentColumns[0];
    assert.match(cols, /stripe_transfer_id/);
    assert.match(cols, /destination_account_id/);
    assert.doesNotMatch(cols, /stripe_payment_intent_id/);
    assert.doesNotMatch(cols, /stripe_charge_id/);
    assert.doesNotMatch(cols, /application_fee_cents/);
    // HSA fields are seeker-side tax categorisation.
    assert.doesNotMatch(cols, /hsa_eligible/);
    assert.doesNotMatch(cols, /hsa_tagged_at/);
  });
});
