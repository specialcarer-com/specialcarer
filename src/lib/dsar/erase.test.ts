import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleDsarErase,
  maxRetainedUntil,
  pseudonymFor,
  summariseNulled,
  summariseRetained,
  DSAR_ERASE_CONSTANTS,
  type ErasureAdminClient,
} from "./erase";
import { renderDsarErasedEmail } from "./emails";

// --------------------------------------------------------------------------
// In-memory fake Supabase client
// --------------------------------------------------------------------------

type UpdateCall = {
  table: string;
  values: Record<string, unknown>;
  eq_column: string;
  eq_value: string;
};

type InsertCall = {
  table: string;
  rows: Record<string, unknown>[];
};

type FailureMap = {
  /** Tables whose UPDATE returns a schema-not-ready error. */
  missingTables?: Set<string>;
  /** Tables whose UPDATE returns an arbitrary DB error. */
  failingTables?: Map<string, { code?: string; message?: string }>;
  /** Simulate audit insert failure. */
  auditInsertError?: { code?: string; message?: string };
  /** Simulate deferred queue insert failure. */
  deferredInsertError?: { code?: string; message?: string };
  /** Simulate request update failure. */
  requestUpdateError?: { code?: string; message?: string };
  /** Row-count returned by UPDATEs for successful calls. Default 1. */
  updateCount?: number;
};

function makeFakeClient(fail: FailureMap = {}): {
  client: ErasureAdminClient;
  updates: UpdateCall[];
  inserts: InsertCall[];
} {
  const updates: UpdateCall[] = [];
  const inserts: InsertCall[] = [];
  const count = fail.updateCount ?? 1;

  const client: ErasureAdminClient = {
    from(table: string) {
      return {
        update(values) {
          return {
            async eq(column, value) {
              updates.push({
                table,
                values,
                eq_column: column,
                eq_value: value,
              });
              if (fail.missingTables?.has(table)) {
                return {
                  data: null,
                  error: {
                    code: "42P01",
                    message: `relation "${table}" does not exist`,
                  },
                };
              }
              const explicit = fail.failingTables?.get(table);
              if (explicit) {
                return { data: null, error: explicit };
              }
              return { data: null, error: null, count };
            },
          };
        },
        async insert(rows) {
          inserts.push({ table, rows });
          if (table === "dsar_erasure_audit" && fail.auditInsertError) {
            return { data: null, error: fail.auditInsertError };
          }
          if (
            table === "dsar_deferred_erasure_queue" &&
            fail.deferredInsertError
          ) {
            return { data: null, error: fail.deferredInsertError };
          }
          return { data: [], error: null };
        },
      };
    },
  };

  return { client, updates, inserts };
}

// Fake for the dsar_requests UPDATE. handleDsarErase issues one
// `admin.from("dsar_requests").update({...}).eq("id", request_id)` at
// the end; the client above already routes it via the shared eq path,
// but we need FailureMap.requestUpdateError to be applied specifically
// to that update. Extend the fake:
function makeFakeClientWithRequestUpdate(fail: FailureMap = {}): {
  client: ErasureAdminClient;
  updates: UpdateCall[];
  inserts: InsertCall[];
} {
  const base = makeFakeClient(fail);
  const originalFrom = base.client.from;
  base.client.from = (table: string) => {
    const child = originalFrom(table);
    if (table === "dsar_requests" && fail.requestUpdateError) {
      return {
        update(values) {
          return {
            async eq(column, value) {
              base.updates.push({
                table,
                values,
                eq_column: column,
                eq_value: value,
              });
              return { data: null, error: fail.requestUpdateError! };
            },
          };
        },
        insert: child.insert,
      };
    }
    return child;
  };
  return base;
}

const BASE_INPUT = {
  dsar_request_id: "req-1",
  subject_email: "alice@example.com",
  subject_user_id: "user-1",
  now: new Date("2026-09-12T00:00:00Z"),
};

// --------------------------------------------------------------------------
// pseudonymFor
// --------------------------------------------------------------------------

describe("pseudonymFor", () => {
  it("returns a stable pseudonym for the same user id", () => {
    const a = pseudonymFor("user-1");
    const b = pseudonymFor("user-1");
    assert.equal(a, b);
    assert.match(a, /^erased\+[a-f0-9]{24}@erased\.specialcarer\.local$/);
  });

  it("returns different pseudonyms for different user ids", () => {
    assert.notEqual(pseudonymFor("user-1"), pseudonymFor("user-2"));
  });

  it("handles null user id without throwing", () => {
    const p = pseudonymFor(null);
    assert.match(p, /^erased\+/);
  });
});

// --------------------------------------------------------------------------
// handleDsarErase — happy path
// --------------------------------------------------------------------------

describe("handleDsarErase — happy path", () => {
  it("returns ok:true and executes every manifest step", async () => {
    const { client, updates, inserts } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    assert.equal(result.ok, true);
    // Every non-retain step in the manifest triggers one UPDATE, plus
    // the final dsar_requests state flip.
    const nonRetainSteps = DSAR_ERASE_CONSTANTS.ERASURE_MANIFEST.filter(
      (s) => s.action !== "retain",
    ).length;
    assert.equal(updates.length, nonRetainSteps + 1);
    // Two inserts: audit + (deferred, if any). The default manifest
    // has no soft-delete rows, so only audit.
    const auditInsert = inserts.find(
      (i) => i.table === "dsar_erasure_audit",
    );
    assert.ok(auditInsert, "expected audit insert");
  });

  it("records one audit row per manifest step plus the self-audit row", async () => {
    const { client, inserts } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const auditInsert = inserts.find(
      (i) => i.table === "dsar_erasure_audit",
    );
    assert.ok(auditInsert);
    assert.equal(
      auditInsert!.rows.length,
      DSAR_ERASE_CONSTANTS.ERASURE_MANIFEST.length + 1,
    );
    // The self-audit row is the trailing dsar_erasure_audit retain entry.
    const last = auditInsert!.rows[auditInsert!.rows.length - 1] as {
      table_name: string;
      action: string;
    };
    assert.equal(last.table_name, "dsar_erasure_audit");
    assert.equal(last.action, "retain");
    // No handler-level error is asserted here; assertion above suffices.
    void result;
  });

  it("targets profile PII columns with SET x = NULL", async () => {
    const { client, updates } = makeFakeClient();
    await handleDsarErase(client, BASE_INPUT);
    const profileNulls = updates.filter(
      (u) => u.table === "profiles",
    );
    // profiles has three nulled columns: full_name, phone, country.
    assert.equal(profileNulls.length, 3);
    for (const u of profileNulls) {
      const [col, val] = Object.entries(u.values)[0];
      assert.equal(val, null, `expected ${col} set to null`);
      assert.equal(u.eq_column, "id");
      assert.equal(u.eq_value, "user-1");
    }
  });

  it("uses subject_email as owner_value for the dsar_requests notes null", async () => {
    const { client, updates } = makeFakeClient();
    await handleDsarErase(client, BASE_INPUT);
    const dsarNulls = updates.filter(
      (u) => u.table === "dsar_requests" && "notes" in u.values,
    );
    assert.equal(dsarNulls.length, 1);
    assert.equal(dsarNulls[0].eq_column, "subject_email");
    assert.equal(dsarNulls[0].eq_value, "alice@example.com");
  });

  it("flips dsar_requests state to 'erased' at the end", async () => {
    const { client, updates } = makeFakeClient();
    await handleDsarErase(client, BASE_INPUT);
    const stateFlip = updates.find(
      (u) => u.table === "dsar_requests" && u.values.state === "erased",
    );
    assert.ok(stateFlip, "expected dsar_requests state flip");
    assert.equal(stateFlip!.eq_column, "id");
    assert.equal(stateFlip!.eq_value, "req-1");
    assert.ok(stateFlip!.values.delivered_at);
  });

  it("computes a stable digest across identical runs", async () => {
    const a = await handleDsarErase(makeFakeClient().client, BASE_INPUT);
    const b = await handleDsarErase(makeFakeClient().client, BASE_INPUT);
    assert.equal(a.digest, b.digest);
    assert.equal(a.digest.length, 16);
  });
});

// --------------------------------------------------------------------------
// handleDsarErase — degradation
// --------------------------------------------------------------------------

describe("handleDsarErase — degradation", () => {
  it("skips a missing table with reason 'schema_not_ready' without aborting", async () => {
    const { client, updates } = makeFakeClientWithRequestUpdate({
      missingTables: new Set(["caregiver_profiles"]),
    });
    const result = await handleDsarErase(client, BASE_INPUT);
    assert.equal(result.ok, true);
    // Caregiver_profile UPDATEs were attempted (recorded in updates) but
    // subsequent profiles + care_plans + bookings + safeguarding steps
    // still ran, and the final state-flip UPDATE happened too.
    const stateFlip = updates.find(
      (u) => u.table === "dsar_requests" && u.values.state === "erased",
    );
    assert.ok(stateFlip);
    const skipped = result.audit.filter(
      (a) => a.table_name === "caregiver_profiles" && a.action === "skip",
    );
    assert.ok(skipped.length > 0);
    for (const s of skipped) {
      assert.equal(s.reason, "schema_not_ready");
    }
  });

  it("captures generic DB errors as 'db_error' skip rows", async () => {
    const failingTables = new Map<string, { code?: string; message?: string }>();
    failingTables.set("profiles", {
      code: "23505",
      message: "duplicate key",
    });
    const { client } = makeFakeClientWithRequestUpdate({ failingTables });
    const result = await handleDsarErase(client, BASE_INPUT);
    assert.equal(result.ok, true);
    const skips = result.audit.filter(
      (a) => a.table_name === "profiles" && a.action === "skip",
    );
    assert.equal(skips.length, 3); // full_name, phone, country
    for (const s of skips) {
      assert.equal(s.reason, "db_error");
      assert.match(s.error ?? "", /duplicate/);
    }
  });

  it("returns audit_persist_error when audit insert fails but does not throw", async () => {
    const { client } = makeFakeClientWithRequestUpdate({
      auditInsertError: { code: "22P02", message: "insert failed" },
    });
    const result = await handleDsarErase(client, BASE_INPUT);
    assert.equal(result.ok, true);
    assert.match(result.audit_persist_error ?? "", /insert failed/);
    // The row-level UPDATEs still happened.
    assert.ok(result.audit.length > 0);
  });

  it("returns request_persist_error when the state flip fails", async () => {
    const { client } = makeFakeClientWithRequestUpdate({
      requestUpdateError: { message: "concurrent update" },
    });
    const result = await handleDsarErase(client, BASE_INPUT);
    assert.equal(result.ok, true);
    assert.match(result.request_persist_error ?? "", /concurrent update/);
  });

  it("skips user-id-keyed steps when subject_user_id is null", async () => {
    const { client } = makeFakeClientWithRequestUpdate();
    const result = await handleDsarErase(client, {
      ...BASE_INPUT,
      subject_user_id: null,
    });
    assert.equal(result.ok, true);
    const userSkips = result.audit.filter(
      (a) => a.reason === "subject_user_id_missing",
    );
    assert.ok(userSkips.length > 0);
    // The email-keyed dsar_requests notes null should still have run.
    const notesRow = result.audit.find(
      (a) => a.table_name === "dsar_requests" && a.column_name === "notes",
    );
    assert.ok(notesRow);
    assert.equal(notesRow!.action, "null");
  });
});

// --------------------------------------------------------------------------
// Retention decisions
// --------------------------------------------------------------------------

describe("retention decisions", () => {
  it("bookings and care_plans get 'retain' with legal basis and retained_until", async () => {
    const { client } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const bookings = result.audit.filter(
      (a) => a.table_name === "bookings",
    );
    assert.ok(bookings.length >= 2, "expected seeker + carer booking retain rows");
    for (const b of bookings) {
      assert.equal(b.action, "retain");
      assert.match(b.reason ?? "", /Companies Act|HMRC/);
      assert.match(b.retained_until ?? "", /^\d{4}-\d{2}-\d{2}$/);
    }
    const carePlans = result.audit.filter(
      (a) => a.table_name === "care_plans",
    );
    assert.ok(carePlans.length >= 2);
    for (const c of carePlans) {
      assert.equal(c.action, "retain");
      assert.match(c.reason ?? "", /Records Management Code/);
    }
  });

  it("safeguarding_alerts is retained under Art. 17(3)(b) not nulled", async () => {
    const { client } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const sg = result.audit.filter(
      (a) => a.table_name === "safeguarding_alerts",
    );
    assert.ok(sg.length >= 2);
    for (const s of sg) {
      assert.equal(s.action, "retain");
      assert.match(s.reason ?? "", /Art\. 17\(3\)\(b\)/);
    }
  });

  it("bookings payroll retention date is at least 6 years in the future", async () => {
    const { client } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const bookings = result.audit.filter(
      (a) => a.table_name === "bookings" && a.action === "retain",
    );
    const now = BASE_INPUT.now.getUTCFullYear();
    for (const b of bookings) {
      const year = Number((b.retained_until ?? "").slice(0, 4));
      assert.ok(year >= now + 6, `${b.retained_until} should be >= ${now + 6}`);
    }
  });

  it("maxRetainedUntil returns the furthest-out date", async () => {
    const { client } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const max = maxRetainedUntil(result.audit);
    assert.ok(max);
    const year = Number(max!.slice(0, 4));
    assert.ok(year >= BASE_INPUT.now.getUTCFullYear() + 6);
  });
});

// --------------------------------------------------------------------------
// Summarisers + email
// --------------------------------------------------------------------------

describe("summarisers", () => {
  it("summariseNulled returns one entry per null/pseudonymise action", async () => {
    const { client } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const nulled = summariseNulled(result.audit);
    assert.ok(nulled.length > 0);
    // No retain rows leak into the nulled list.
    for (const n of nulled) {
      const found = DSAR_ERASE_CONSTANTS.ERASURE_MANIFEST.find(
        (s) => s.label === n.label,
      );
      assert.ok(found);
      assert.ok(found!.action === "null" || found!.action === "pseudonymise");
    }
  });

  it("summariseRetained includes legal basis and expiry", async () => {
    const { client } = makeFakeClient();
    const result = await handleDsarErase(client, BASE_INPUT);
    const retained = summariseRetained(result.audit);
    assert.ok(retained.length > 0);
    for (const r of retained) {
      assert.ok(r.legal_basis);
      assert.ok(r.label);
    }
  });
});

describe("renderDsarErasedEmail", () => {
  it("mentions the request id, digest and ICO", () => {
    const email = renderDsarErasedEmail({
      subject_email: "alice@example.com",
      request_id: "req-1",
      nulled: [{ label: "Profile — phone", row_count: 1 }],
      retained: [
        {
          label: "Bookings",
          legal_basis: "HMRC record-keeping",
          retained_until: "2032-12-31",
        },
      ],
      max_retained_until: "2032-12-31",
      digest: "abc123",
    });
    assert.match(email.subject, /erasure/);
    assert.match(email.html, /req-1/);
    assert.match(email.html, /abc123/);
    assert.match(email.html, /ico\.org\.uk/);
    assert.match(email.text, /req-1/);
    assert.match(email.text, /abc123/);
    assert.match(email.text, /0303 123 1113/);
    // Nulled + retained categories both appear in HTML + text.
    assert.match(email.html, /Profile — phone/);
    assert.match(email.text, /Profile — phone/);
    assert.match(email.html, /Bookings/);
    assert.match(email.html, /2032-12-31/);
  });

  it("degrades gracefully when nothing was nulled or retained", () => {
    const email = renderDsarErasedEmail({
      subject_email: "alice@example.com",
      request_id: "req-1",
      nulled: [],
      retained: [],
      max_retained_until: null,
      digest: "empty0",
    });
    assert.match(email.html, /No fields required nulling/);
    assert.match(email.html, /Nothing was retained/);
    // No "latest date" paragraph rendered.
    assert.doesNotMatch(email.html, /latest date on which/);
  });

  it("escapes HTML in dynamic values", () => {
    const email = renderDsarErasedEmail({
      subject_email: "alice@example.com",
      request_id: "req-<script>",
      nulled: [{ label: "<b>x</b>", row_count: 0 }],
      retained: [],
      max_retained_until: null,
      digest: "abc",
    });
    assert.doesNotMatch(email.html, /<script>/);
    assert.doesNotMatch(email.html, /<b>x<\/b>/);
    assert.match(email.html, /&lt;script&gt;/);
    assert.match(email.html, /&lt;b&gt;x&lt;\/b&gt;/);
  });
});
