/**
 * Failure-mode smoke test.
 *
 * Exercises the two production risk paths that unit tests cover but a
 * runtime smoke never has:
 *   1. schema_not_ready — a manifest table is missing (e.g. drift).
 *      Handler must record a 'skip' with reason='schema_not_ready' and
 *      keep going, not throw.
 *   2. audit_persist_error — inserting into dsar_erasure_audit fails.
 *      Handler must still return ok:true with the error captured, so
 *      the row-level nulling isn't reversed.
 */

import { handleDsarErase, type ErasureAdminClient } from "../src/lib/dsar/erase";

type Row = Record<string, unknown>;
const SUBJECT_UUID = "aaaaaaaa-bbbb-cccc-dddd-000000000001";
const REQUEST_UUID = "aaaaaaaa-bbbb-cccc-dddd-000000000002";

// ---------- Scenario 1: missing table -----------------------------
/** Verify that a missing manifest table is skipped without aborting erasure. */
async function scenario1_missingTable() {
  console.log("--- SCENARIO 1: caregiver_profiles table missing ---");
  const store: Record<string, Row[]> = {
    profiles: [{ id: SUBJECT_UUID, full_name: "x", phone: "y", country: "GB" }],
    // caregiver_profiles intentionally absent
    dsar_erasure_audit: [],
    dsar_deferred_erasure_queue: [],
    dsar_requests: [{ id: REQUEST_UUID, state: "in_progress" }],
  };
  const client: ErasureAdminClient = {
    from(table) {
      return {
        update(values) {
          return {
            async eq(col, val) {
              if (!store[table]) {
                return {
                  data: null,
                  error: { code: "42P01", message: `relation "${table}" does not exist` },
                };
              }
              let n = 0;
              for (const r of store[table]) if (r[col] === val) { Object.assign(r, values); n++; }
              return { data: null, error: null, count: n };
            },
          };
        },
        async insert(rows) {
          if (!store[table])
            return { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } };
          store[table].push(...rows);
          return { data: rows, error: null };
        },
      };
    },
  };
  const r = await handleDsarErase(client, {
    dsar_request_id: REQUEST_UUID,
    subject_email: "s@x.com",
    subject_user_id: SUBJECT_UUID,
    now: new Date("2026-09-12T02:42:00Z"),
  });
  const skips = r.audit.filter(a => a.action === "skip" && a.reason === "schema_not_ready");
  const caregiverSkips = skips.filter(a => a.table_name === "caregiver_profiles");
  console.log(`  ok: ${r.ok}, audit_persist_error: ${r.audit_persist_error}`);
  console.log(`  total skips: ${skips.length}, caregiver_profiles skips: ${caregiverSkips.length}`);
  const nulled = r.audit.filter(a => a.action === "null" && a.table_name === "profiles");
  console.log(`  profiles 'null' rows: ${nulled.length}`);
  const pass = r.ok && caregiverSkips.length >= 6 && nulled.length === 3 && r.audit_persist_error === null;
  console.log(`  ${pass ? "PASS" : "FAIL"}: handler continued past missing table, nulled profiles, recorded skips`);
  return pass;
}

// ---------- Scenario 2: audit insert fails ------------------------
/** Verify that an audit insert failure is reported without undoing erasure. */
async function scenario2_auditInsertFailure() {
  console.log("--- SCENARIO 2: dsar_erasure_audit insert fails ---");
  const store: Record<string, Row[]> = {
    profiles: [{ id: SUBJECT_UUID, full_name: "x", phone: "y", country: "GB" }],
    caregiver_profiles: [{ user_id: SUBJECT_UUID, display_name: "d", bio: "b" }],
    dsar_erasure_audit: [],
    dsar_deferred_erasure_queue: [],
    dsar_requests: [{ id: REQUEST_UUID, state: "in_progress" }],
  };
  const client: ErasureAdminClient = {
    from(table) {
      return {
        update(values) {
          return {
            async eq(col, val) {
              if (!store[table]) return { data: null, error: { code: "42P01", message: "missing" } };
              let n = 0;
              for (const r of store[table]) if (r[col] === val) { Object.assign(r, values); n++; }
              return { data: null, error: null, count: n };
            },
          };
        },
        async insert(rows) {
          if (table === "dsar_erasure_audit") {
            return { data: null, error: { code: "40001", message: "serialization failure" } };
          }
          if (!store[table]) return { data: null, error: { code: "42P01", message: "missing" } };
          store[table].push(...rows);
          return { data: rows, error: null };
        },
      };
    },
  };
  const r = await handleDsarErase(client, {
    dsar_request_id: REQUEST_UUID,
    subject_email: "s@x.com",
    subject_user_id: SUBJECT_UUID,
    now: new Date("2026-09-12T02:42:00Z"),
  });
  console.log(`  ok: ${r.ok}, audit_persist_error: ${r.audit_persist_error}`);
  console.log(`  profiles.full_name after: ${store.profiles[0].full_name} (should be null — nulling should NOT reverse)`);
  console.log(`  dsar_requests.state: ${store.dsar_requests[0].state}`);
  const pass = r.ok
    && r.audit_persist_error === "serialization failure"
    && store.profiles[0].full_name === null
    && store.dsar_requests[0].state === "erased";
  console.log(`  ${pass ? "PASS" : "FAIL"}: handler surfaced audit error but did NOT reverse the erasure`);
  return pass;
}

/** Run both failure-mode scenarios and exit with their combined status. */
async function main() {
  const p1 = await scenario1_missingTable();
  console.log();
  const p2 = await scenario2_auditInsertFailure();
  console.log();
  const all = p1 && p2;
  console.log(all ? "FAILURE-MODE SMOKE PASSED" : "FAILURE-MODE SMOKE FAILED");
  process.exit(all ? 0 : 1);
}
main();
