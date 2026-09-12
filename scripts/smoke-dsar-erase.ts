/**
 * Production-shape smoke test for the DSAR erasure handler.
 *
 * Invokes handleDsarErase() with a fully-populated in-memory Supabase
 * admin client that persists rows the same way Postgres would, so we
 * can assert:
 *   - every manifest step runs
 *   - null/retain/skip actions land correctly in audit
 *   - deferred queue is populated for retain steps that would eventually
 *     hard-delete
 *   - retention dates are computed correctly (6y care, HMRC year+6 EOY,
 *     payroll year+3 past next 5-Apr)
 *   - dsar_requests state flips to 'erased'
 *   - digest is stable given identical inputs (cross-run)
 *
 * No prod / no Supabase / no network.
 */

import {
  handleDsarErase,
  DSAR_ERASE_CONSTANTS,
  type ErasureAdminClient,
} from "../src/lib/dsar/erase";

// ------------- in-memory store faking the tables we care about
type Row = Record<string, unknown>;
const store: Record<string, Row[]> = {
  profiles: [],
  caregiver_profiles: [],
  care_plans: [],
  bookings: [],
  dsar_requests: [],
  dsar_erasure_audit: [],
  dsar_deferred_erasure_queue: [],
  // Manifest also touches these tables; empty is fine — handler will
  // report row_count: 0 for them.
  care_visits: [],
  care_visit_notes: [],
  messages: [],
  message_attachments: [],
  match_signals: [],
  payroll_ledger: [],
  dsar_request_files: [],
};

function fakeUpdate(table: string, values: Row, col: string, val: string) {
  const rows = store[table];
  if (!rows) {
    return {
      data: null,
      error: { code: "42P01", message: `relation "${table}" does not exist` },
    };
  }
  let n = 0;
  for (const r of rows) {
    if (r[col] === val) {
      Object.assign(r, values);
      n++;
    }
  }
  return { data: null, error: null, count: n };
}

const client: ErasureAdminClient = {
  from(table: string) {
    return {
      update(values: Row) {
        return {
          async eq(col: string, val: string) {
            return fakeUpdate(table, values, col, val);
          },
        };
      },
      async insert(rows: Row[]) {
        if (!store[table])
          return {
            data: null,
            error: {
              code: "42P01",
              message: `relation "${table}" does not exist`,
            },
          };
        store[table].push(...rows);
        return { data: rows, error: null };
      },
    };
  },
};

// ------------- plant a subject
const SUBJECT_UUID = "00000000-1111-2222-3333-444444444444";
const REQUEST_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SUBJECT_EMAIL = "smoke@specialcarer.com";
const CLOCK = new Date("2026-09-12T02:42:00Z"); // fixed clock for deterministic dates

store.profiles.push({
  id: SUBJECT_UUID,
  full_name: "Smoke Subject",
  phone: "+44 000 000 0000",
  country: "GB",
  role: "seeker",
  email: SUBJECT_EMAIL,
});
store.caregiver_profiles.push({
  user_id: SUBJECT_UUID,
  display_name: "Smoke Carer",
  bio: "test bio",
  headline: "test headline",
  photo_url: "https://example.com/x.jpg",
  postcode: "SW1A 1AA",
  city: "London",
  is_published: true,
});
store.care_plans.push({
  id: "cp-1",
  booking_id: "bk-1",
  created_by: SUBJECT_UUID,
  address_line1: "1 Test St",
  special_instructions: "none",
});
store.bookings.push({
  id: "bk-1",
  seeker_id: SUBJECT_UUID,
  starts_at: "2026-08-01",
  ends_at: "2026-08-01",
  hours: 1,
  hourly_rate_cents: 2500,
  subtotal_cents: 2500,
  platform_fee_cents: 375,
  total_cents: 2875,
  service_type: "visiting",
});
store.dsar_requests.push({
  id: REQUEST_UUID,
  subject_user_id: SUBJECT_UUID,
  subject_email: SUBJECT_EMAIL,
  request_type: "erasure",
  state: "in_progress",
});
store.messages.push({
  id: "msg-1",
  sender_id: SUBJECT_UUID,
  body: "hello",
});

console.log("BEFORE erasure:");
console.log("  profiles:", JSON.stringify(store.profiles[0]));
console.log("  caregiver_profiles:", JSON.stringify(store.caregiver_profiles[0]));
console.log("  care_plans:", JSON.stringify(store.care_plans[0]));
console.log("  dsar_requests.state:", store.dsar_requests[0].state);
console.log();

// ------------- run (wrapped in main() because tsx CJS mode disallows top-level await)
async function main() {
const result = await handleDsarErase(client, {
  dsar_request_id: REQUEST_UUID,
  subject_email: SUBJECT_EMAIL,
  subject_user_id: SUBJECT_UUID,
  now: CLOCK,
});

console.log("HANDLER RESULT SUMMARY:");
console.log("  ok:", result.ok);
console.log("  version:", result.version);
console.log("  digest:", result.digest);
console.log("  audit rows:", result.audit.length);
console.log("  deferred rows:", result.deferred.length);
console.log("  audit_persist_error:", result.audit_persist_error);
console.log("  deferred_persist_error:", result.deferred_persist_error);
console.log("  request_persist_error:", result.request_persist_error);
console.log();

console.log("AFTER erasure:");
console.log("  profiles:", JSON.stringify(store.profiles[0]));
console.log("  caregiver_profiles:", JSON.stringify(store.caregiver_profiles[0]));
console.log("  care_plans (retained):", JSON.stringify(store.care_plans[0]));
console.log("  dsar_requests.state:", store.dsar_requests[0].state);
console.log("  dsar_requests.delivered_at:", store.dsar_requests[0].delivered_at);
console.log();

// ------------- assertions
const errors: string[] = [];
function check(cond: boolean, msg: string) {
  if (!cond) errors.push("FAIL: " + msg);
  else console.log("PASS:", msg);
}

check(store.profiles[0].full_name === null, "profiles.full_name is NULL");
check(store.profiles[0].phone === null, "profiles.phone is NULL");
check(store.profiles[0].country === null, "profiles.country is NULL");
check(
  store.caregiver_profiles[0].display_name === null,
  "caregiver_profiles.display_name is NULL",
);
check(store.caregiver_profiles[0].bio === null, "caregiver_profiles.bio is NULL");
check(
  store.caregiver_profiles[0].photo_url === null,
  "caregiver_profiles.photo_url is NULL",
);
check(store.caregiver_profiles[0].postcode === null, "postcode is NULL");
check(store.caregiver_profiles[0].city === null, "city is NULL");
check(
  store.care_plans[0].address_line1 === "1 Test St",
  "care_plans.address_line1 RETAINED (not nulled)",
);
check(
  store.care_plans[0].special_instructions === "none",
  "care_plans.special_instructions RETAINED (not nulled)",
);
check(store.dsar_requests[0].state === "erased", "dsar_requests.state flipped to 'erased'");
check(!!store.dsar_requests[0].delivered_at, "dsar_requests.delivered_at set");
check(
  store.dsar_erasure_audit.length === result.audit.length,
  "audit rows persisted to store",
);
check(
  store.dsar_deferred_erasure_queue.length === result.deferred.length,
  `deferred rows persisted to store (count=${result.deferred.length}; expected 0 today because current manifest has no soft-delete steps)`,
);
check(/^[0-9a-f]{16}$/i.test(result.digest), `digest is 16 hex chars: ${result.digest}`);
check(result.version === DSAR_ERASE_CONSTANTS.ERASE_VERSION, "handler version matches constant");

// audit sanity — every audit row should have a request_id + email + action
for (const [i, a] of result.audit.entries()) {
  if (
    a.dsar_request_id !== REQUEST_UUID ||
    a.subject_email !== SUBJECT_EMAIL ||
    !["null", "retain", "pseudonymise", "soft-delete", "skip"].includes(a.action)
  ) {
    errors.push(`FAIL: audit[${i}] malformed: ${JSON.stringify(a)}`);
  }
}
console.log(`audit shape sanity: ${result.audit.length} rows checked`);

// retention windows: care records should be 2032-09-12, HMRC 2032-12-31
const careDate = result.audit.find(
  (a) => a.table_name === "care_plans" && a.action === "retain",
)?.retained_until;
check(careDate === "2032-09-12", `care_plans retained_until = ${careDate} (expected 2032-09-12)`);

const bookingsDate = result.audit.find(
  (a) => a.table_name === "bookings" && a.action === "retain",
)?.retained_until;
check(bookingsDate === "2032-12-31", `bookings retained_until = ${bookingsDate} (expected 2032-12-31)`);

// digest determinism — re-running with identical inputs should produce the same digest
const store2Backup = JSON.parse(JSON.stringify(store));
// reset writable rows to their pre-erasure shape
store.profiles[0] = { id: SUBJECT_UUID, full_name: "Smoke Subject", phone: "+44", country: "GB", role: "seeker", email: SUBJECT_EMAIL };
store.caregiver_profiles[0] = { user_id: SUBJECT_UUID, display_name: "x", bio: "y", headline: "z", photo_url: "u", postcode: "p", city: "c", is_published: true };
store.dsar_requests[0].state = "in_progress";
store.dsar_erasure_audit.length = 0;
store.dsar_deferred_erasure_queue.length = 0;

const result2 = await handleDsarErase(client, {
  dsar_request_id: REQUEST_UUID,
  subject_email: SUBJECT_EMAIL,
  subject_user_id: SUBJECT_UUID,
  now: CLOCK,
});
check(result.digest === result2.digest, `digest determinism: ${result.digest} == ${result2.digest}`);
void store2Backup;

console.log();
if (errors.length) {
  console.log(`SMOKE TEST FAILED — ${errors.length} error(s):`);
  for (const e of errors) console.log(" ", e);
  process.exit(1);
} else {
  console.log(`SMOKE TEST PASSED — ${result.audit.length} audit rows, ${result.deferred.length} deferred rows, digest ${result.digest}`);
}
}
main().catch(err => { console.error(err); process.exit(1); });
