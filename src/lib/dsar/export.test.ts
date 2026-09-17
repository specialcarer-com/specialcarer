import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { exportSubject, type ExportAdminClient } from "./export";
import {
  generateVerificationToken,
  hashVerificationToken,
} from "./token";

/**
 * A tiny fake for the narrow slice of Supabase's PostgREST surface
 * `exportSubject` uses. Each table has a canned rows array and can
 * simulate errors.
 */
type Fixture = Record<
  string,
  { rows: unknown[]; error?: { message: string; code?: string } }
>;

function makeAdmin(
  fixture: Fixture,
  spy?: {
    calls: Array<{ table: string; column?: string; value?: string; or?: string }>;
  },
): ExportAdminClient {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            async eq(column: string, value: string) {
              spy?.calls.push({ table, column, value });
              const entry = fixture[table];
              if (!entry) {
                return {
                  data: null,
                  error: {
                    code: "42P01",
                    message: `relation "${table}" does not exist`,
                  },
                };
              }
              if (entry.error) return { data: null, error: entry.error };
              // Naive filter — the fixture is already narrowed to the
              // subject in tests that care.
              return { data: entry.rows, error: null };
            },
            async or(filter: string) {
              spy?.calls.push({ table, or: filter });
              const entry = fixture[table];
              if (!entry) {
                return {
                  data: null,
                  error: {
                    code: "42P01",
                    message: `relation "${table}" does not exist`,
                  },
                };
              }
              if (entry.error) return { data: null, error: entry.error };
              return { data: entry.rows, error: null };
            },
          };
        },
      };
    },
  };
}

describe("exportSubject", () => {
  const subject = { user_id: "user-1", email: "subject@example.com" };

  it("collects rows from each simple owner-column table", async () => {
    const admin = makeAdmin({
      profiles: { rows: [{ id: "user-1", email: subject.email }] },
      caregiver_profiles: { rows: [{ user_id: "user-1", verified: true }] },
      bookings: {
        rows: [
          { id: "bk-1", seeker_id: "user-1" },
          { id: "bk-2", caregiver_id: "user-1" },
        ],
      },
      carer_references: { rows: [] },
      compliance_documents: { rows: [{ caregiver_id: "user-1" }] },
      dbs_change_events: { rows: [] },
      care_plans: { rows: [{ seeker_id: "user-1" }] },
      reviews: { rows: [{ reviewer_id: "user-1", body: "hi" }] },
      saved_caregivers: { rows: [] },
      payments: { rows: [{ id: "p-1", amount_cents: 3000 }] },
      refund_ledger: { rows: [{ booking_id: "bk-1", amount_cents: 1000 }] },
    });

    const out = await exportSubject(admin, subject);

    const byName = new Map(out.tables.map((t) => [t.table, t]));
    assert.equal(byName.get("profiles")?.row_count, 1);
    assert.equal(byName.get("bookings")?.row_count, 2);
    assert.equal(byName.get("payments")?.row_count, 1);
    assert.equal(byName.get("refund_ledger")?.row_count, 1);
    assert.equal(out.subject.user_id, subject.user_id);
    assert.equal(out.subject.email, subject.email);
    assert.ok(out.subject.digest.length === 16);
  });

  it("filters the fetch by subject id (never a full scan)", async () => {
    const calls: Array<{
      table: string;
      column?: string;
      value?: string;
      or?: string;
    }> = [];
    const admin = makeAdmin(
      {
        profiles: { rows: [] },
        caregiver_profiles: { rows: [] },
        bookings: { rows: [] },
        carer_references: { rows: [] },
        compliance_documents: { rows: [] },
        dbs_change_events: { rows: [] },
        care_plans: { rows: [] },
        reviews: { rows: [] },
        saved_caregivers: { rows: [] },
        payments: { rows: [] },
        refund_ledger: { rows: [] },
      },
      { calls },
    );
    await exportSubject(admin, subject);

    // Every call is either an eq() with the subject id or an or()
    // clause naming the subject id. No table is ever fetched without
    // the subject filter applied.
    for (const call of calls) {
      if (call.value !== undefined) {
        assert.equal(call.value, subject.user_id);
      } else if (call.or !== undefined) {
        assert.ok(
          call.or.includes(subject.user_id),
          `or clause on ${call.table} must reference subject id`,
        );
      } else {
        assert.fail(`call on ${call.table} had no filter`);
      }
    }
  });

  it("degrades to schema_not_ready when refund_ledger is missing", async () => {
    // Simulate the pre-B4 state where refund_ledger doesn't yet exist,
    // but bookings does return some rows so we DO try to fetch the
    // ledger by booking id.
    const admin = makeAdmin({
      profiles: { rows: [{ id: "user-1" }] },
      caregiver_profiles: { rows: [] },
      bookings: { rows: [{ id: "bk-1", seeker_id: "user-1" }] },
      carer_references: { rows: [] },
      compliance_documents: { rows: [] },
      dbs_change_events: { rows: [] },
      care_plans: { rows: [] },
      reviews: { rows: [] },
      saved_caregivers: { rows: [] },
      payments: { rows: [] },
      // refund_ledger deliberately omitted → 42P01 from fake
    });
    const out = await exportSubject(admin, subject);

    const ledger = out.tables.find((t) => t.table === "refund_ledger");
    assert.ok(ledger, "refund_ledger must appear in the manifest even when missing");
    assert.equal(ledger?.note, "schema_not_ready");
    assert.equal(ledger?.row_count, 0);
    assert.ok(
      out.notes.some((n) => n.toLowerCase().includes("refund_ledger")),
      "manifest note must mention refund_ledger",
    );
  });

  it("does not attempt refund_ledger lookup when no bookings exist", async () => {
    const calls: Array<{
      table: string;
      column?: string;
      value?: string;
      or?: string;
    }> = [];
    const admin = makeAdmin(
      {
        profiles: { rows: [] },
        caregiver_profiles: { rows: [] },
        bookings: { rows: [] },
        carer_references: { rows: [] },
        compliance_documents: { rows: [] },
        dbs_change_events: { rows: [] },
        care_plans: { rows: [] },
        reviews: { rows: [] },
        saved_caregivers: { rows: [] },
        payments: { rows: [] },
        refund_ledger: {
          rows: [],
          error: {
            message: "should not have been called",
            code: "SHOULD_NOT_HAPPEN",
          },
        },
      },
      { calls },
    );
    const out = await exportSubject(admin, subject);
    const ledger = out.tables.find((t) => t.table === "refund_ledger");
    assert.equal(ledger?.row_count, 0);
    // No error propagated up because we short-circuited.
    assert.equal(ledger?.error, undefined);
    // And we never made an actual query against refund_ledger.
    assert.equal(
      calls.filter((c) => c.table === "refund_ledger").length,
      0,
    );
  });

  it("payments projection uses the safe column list, not '*'", async () => {
    // Payments is a booking-linked lookup since v1.1.0 — it only
    // runs when bookings returned at least one row where the subject
    // holds a known role (seeker or caregiver), so we seed one where
    // the subject is the seeker.
    const capturedColumns: string[] = [];
    const admin: ExportAdminClient = {
      from(table: string) {
        return {
          select(columns: string) {
            if (table === "payments") capturedColumns.push(columns);
            return {
              async eq(_c: string, _v: string) {
                if (table === "bookings") {
                  return {
                    data: [{ id: "bk-1", seeker_id: subject.user_id }],
                    error: null,
                  };
                }
                return { data: [], error: null };
              },
              async or(_f: string) {
                if (table === "bookings") {
                  return {
                    data: [{ id: "bk-1", seeker_id: subject.user_id }],
                    error: null,
                  };
                }
                return { data: [], error: null };
              },
            };
          },
        };
      },
    };
    await exportSubject(admin, subject);
    assert.ok(
      capturedColumns.length > 0,
      "payments select must have been called",
    );
    for (const columns of capturedColumns) {
      assert.match(columns, /amount_cents/);
      assert.doesNotMatch(columns, /^\*$/);
      // Refund columns no longer live on `payments` — they moved to
      // `bookings` and `refund_ledger` in the 17 Sep schema drift fix.
      assert.doesNotMatch(columns, /refunded_amount_cents/);
      // Platform-owned fee never appears in a subject export from
      // v1.2.0 onwards.
      assert.doesNotMatch(columns, /application_fee_cents/);
    }
  });

  it("propagates a bookings failure to every booking-linked table", async () => {
    // If bookings itself errors, the subject would otherwise see
    // { care_plans: row_count:0, payments: row_count:0, ... } which
    // silently misrepresents "we couldn't ask" as "you have nothing".
    const admin: ExportAdminClient = {
      from(table: string) {
        return {
          select(_c: string) {
            return {
              async eq(_col: string, _v: string) {
                if (table === "bookings") {
                  return {
                    data: null,
                    error: { code: "XX000", message: "bookings blew up" },
                  };
                }
                return { data: [], error: null };
              },
              async or(_f: string) {
                if (table === "bookings") {
                  return {
                    data: null,
                    error: { code: "XX000", message: "bookings blew up" },
                  };
                }
                return { data: [], error: null };
              },
            };
          },
        };
      },
    };
    const out = await exportSubject(admin, subject);
    const bookings = out.tables.find((t) => t.table === "bookings");
    assert.equal(bookings?.error, "bookings blew up");
    for (const t of ["care_plans", "payments", "refund_ledger"]) {
      const entry = out.tables.find((x) => x.table === t);
      assert.ok(entry, `${t} must appear in the manifest`);
      assert.equal(
        entry?.error,
        "bookings blew up",
        `${t} must inherit the bookings failure rather than silently claim zero rows`,
      );
      assert.equal(entry?.row_count, 0);
    }
  });

  it("includes an integrity digest that is stable for identical manifests", async () => {
    const fx: Fixture = {
      profiles: { rows: [{ id: "user-1" }] },
      caregiver_profiles: { rows: [] },
      bookings: { rows: [] },
      carer_references: { rows: [] },
      compliance_documents: { rows: [] },
      dbs_change_events: { rows: [] },
      care_plans: { rows: [] },
      reviews: { rows: [] },
      saved_caregivers: { rows: [] },
      payments: { rows: [] },
      refund_ledger: { rows: [] },
    };
    const a = await exportSubject(makeAdmin(fx), subject);
    const b = await exportSubject(makeAdmin(fx), subject);
    assert.equal(a.subject.digest, b.subject.digest);
    assert.equal(a.subject.digest.length, 16);
  });
});

describe("verification token", () => {
  it("hash is deterministic for the same raw token", () => {
    const t = generateVerificationToken();
    assert.equal(hashVerificationToken(t.raw), t.hash);
  });

  it("different tokens have different hashes", () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    assert.notEqual(a.raw, b.raw);
    assert.notEqual(a.hash, b.hash);
  });

  it("raw token is url-safe (base64url, no padding)", () => {
    const t = generateVerificationToken();
    // base64url alphabet: A–Z a–z 0–9 - _
    assert.match(t.raw, /^[A-Za-z0-9_-]+$/);
    // 32 bytes -> 43 chars in base64url without padding
    assert.equal(t.raw.length, 43);
    // 32 bytes hashed to sha256 hex -> 64 chars
    assert.equal(t.hash.length, 64);
  });
});
