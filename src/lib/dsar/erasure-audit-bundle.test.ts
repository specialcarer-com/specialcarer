import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildErasureAuditBundle,
  buildErasureAuditZip,
  computeAuditTotals,
  csvField,
  csvRow,
  renderAuditCsv,
  renderDeferredCsv,
  type ErasureBundleAuditRow,
  type ErasureBundleDeferredRow,
  type ErasureBundleRequest,
} from "./erasure-audit-bundle";

// ----------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------

function req(
  overrides: Partial<ErasureBundleRequest> = {},
): ErasureBundleRequest {
  return {
    id: "req-123",
    subject_email: "alice@example.com",
    subject_user_id: "user-1",
    request_type: "erasure",
    state: "erased",
    submitted_at: "2026-09-01T10:00:00Z",
    verified_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    ...overrides,
  };
}

function auditRow(
  overrides: Partial<ErasureBundleAuditRow> = {},
): ErasureBundleAuditRow {
  return {
    id: "audit-1",
    table_name: "bookings",
    column_name: "notes",
    owner_column: "family_user_id",
    owner_value: "user-1",
    action: "null",
    reason: "PII removed",
    retained_until: null,
    row_count: 3,
    error: null,
    executed_at: "2026-09-10T10:05:00Z",
    ...overrides,
  };
}

function deferredRow(
  overrides: Partial<ErasureBundleDeferredRow> = {},
): ErasureBundleDeferredRow {
  return {
    id: "def-1",
    table_name: "invoices",
    owner_column: "family_user_id",
    owner_value: "user-1",
    column_name: null,
    retained_until: "2032-09-10",
    state: "pending",
    attempt_count: 0,
    last_attempt_at: null,
    last_error: null,
    completed_at: null,
    created_at: "2026-09-10T10:05:00Z",
    ...overrides,
  };
}

const FIXED_DATE = new Date(Date.UTC(2026, 8, 10, 12, 0, 0));

// ----------------------------------------------------------------------
// csvField / csvRow
// ----------------------------------------------------------------------

describe("csvField", () => {
  it("empty string for null / undefined", () => {
    assert.equal(csvField(null), "");
    assert.equal(csvField(undefined), "");
  });
  it("quotes strings and doubles internal quotes", () => {
    assert.equal(csvField(`hello "world"`), `"hello ""world"""`);
  });
  it("preserves embedded commas and newlines inside the quotes", () => {
    assert.equal(csvField("a,b\nc"), `"a,b\nc"`);
  });
  it("quotes numbers as their string form", () => {
    assert.equal(csvField(42), `"42"`);
    assert.equal(csvField(0), `"0"`);
  });
});

describe("csvRow", () => {
  it("joins with commas without extra whitespace", () => {
    assert.equal(csvRow(["a", "b", null, 3]), `"a","b",,"3"`);
  });
});

// ----------------------------------------------------------------------
// renderAuditCsv / renderDeferredCsv
// ----------------------------------------------------------------------

describe("renderAuditCsv", () => {
  it("emits the header row and one line per input", () => {
    const csv = renderAuditCsv([auditRow(), auditRow({ id: "audit-2", action: "retain", reason: "Art 17(3)(b)", retained_until: "2032-09-10", row_count: 1 })]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 3); // header + 2 rows
    assert.match(lines[0], /^"id","table_name",/);
    assert.match(lines[1], /"audit-1"/);
    assert.match(lines[2], /"audit-2".*"retain".*"Art 17\(3\)\(b\)".*"2032-09-10"/);
  });
  it("header-only when no rows", () => {
    const csv = renderAuditCsv([]);
    assert.equal(csv.split("\r\n").filter(Boolean).length, 1);
  });
  it("terminates with CRLF", () => {
    assert.ok(renderAuditCsv([]).endsWith("\r\n"));
  });
});

describe("renderDeferredCsv", () => {
  it("emits the header row and one line per input", () => {
    const csv = renderDeferredCsv([deferredRow()]);
    const lines = csv.split("\r\n").filter(Boolean);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^"id","table_name",/);
  });
  it("header-only when the queue is empty", () => {
    const csv = renderDeferredCsv([]);
    assert.equal(csv.split("\r\n").filter(Boolean).length, 1);
    assert.match(csv, /^"id","table_name","owner_column"/);
  });
});

// ----------------------------------------------------------------------
// computeAuditTotals
// ----------------------------------------------------------------------

describe("computeAuditTotals", () => {
  it("counts every action bucket", () => {
    const totals = computeAuditTotals([
      auditRow({ action: "null", row_count: 3 }),
      auditRow({ action: "null", row_count: 2 }),
      auditRow({ action: "pseudonymise", row_count: 4 }),
      auditRow({ action: "anonymise", row_count: 1 }),
      auditRow({ action: "retain", row_count: 5 }),
      auditRow({ action: "soft-delete", row_count: 2 }),
      auditRow({ action: "skip", row_count: 7 }),
    ]);
    assert.deepEqual(totals, {
      rows_nulled: 5,
      rows_pseudonymised: 4,
      rows_anonymised: 1,
      rows_retained: 5,
      rows_soft_deleted: 2,
      rows_skipped: 7,
      step_errors: 0,
    });
  });

  it("counts step errors alongside their action", () => {
    const totals = computeAuditTotals([
      auditRow({ action: "null", row_count: 3, error: "boom" }),
    ]);
    assert.equal(totals.step_errors, 1);
    assert.equal(totals.rows_nulled, 3);
  });

  it("treats an unknown action as an error, not a silent drop", () => {
    const totals = computeAuditTotals([
      auditRow({ action: "wat" as unknown as string, row_count: 9 }),
    ]);
    assert.equal(totals.step_errors, 1);
    assert.equal(totals.rows_nulled, 0);
  });

  it("returns zeros for an empty audit list", () => {
    const totals = computeAuditTotals([]);
    for (const v of Object.values(totals)) assert.equal(v, 0);
  });
});

// ----------------------------------------------------------------------
// buildErasureAuditBundle
// ----------------------------------------------------------------------

describe("buildErasureAuditBundle", () => {
  it("returns the three files in the fixed order", () => {
    const out = buildErasureAuditBundle({
      request: req(),
      audit: [auditRow()],
      deferred: [deferredRow()],
      generated_at: FIXED_DATE,
    });
    assert.deepEqual(
      out.files.map((f) => f.path),
      ["manifest.json", "audit.csv", "deferred.csv"],
    );
  });

  it("computes a digest over audit.csv + '\\n' + deferred.csv", () => {
    const audit = [auditRow()];
    const deferred = [deferredRow()];
    const out = buildErasureAuditBundle({
      request: req(),
      audit,
      deferred,
      generated_at: FIXED_DATE,
    });
    const expected = createHash("sha256")
      .update(renderAuditCsv(audit), "utf8")
      .update("\n", "utf8")
      .update(renderDeferredCsv(deferred), "utf8")
      .digest("hex");
    assert.equal(out.digest, expected);
    assert.equal(out.manifest.digest, `sha256:${expected}`);
  });

  it("stamps the manifest with request metadata and totals", () => {
    const out = buildErasureAuditBundle({
      request: req(),
      audit: [
        auditRow({ action: "null", row_count: 2 }),
        auditRow({ action: "retain", row_count: 1, retained_until: "2032-09-10" }),
      ],
      deferred: [deferredRow(), deferredRow({ id: "def-2" })],
      generated_at: FIXED_DATE,
    });
    assert.equal(out.manifest.request_id, "req-123");
    assert.equal(out.manifest.subject_email, "alice@example.com");
    assert.equal(out.manifest.state, "erased");
    assert.equal(out.manifest.generated_at, FIXED_DATE.toISOString());
    assert.equal(out.manifest.totals.audit_rows, 2);
    assert.equal(out.manifest.totals.deferred_rows, 2);
    assert.equal(out.manifest.totals.rows_nulled, 2);
    assert.equal(out.manifest.totals.rows_retained, 1);
  });

  it("handles the empty case cleanly", () => {
    const out = buildErasureAuditBundle({
      request: req(),
      audit: [],
      deferred: [],
      generated_at: FIXED_DATE,
    });
    assert.equal(out.manifest.totals.audit_rows, 0);
    assert.equal(out.manifest.totals.deferred_rows, 0);
    // audit.csv and deferred.csv still exist and hold their header line.
    const audit = out.files.find((f) => f.path === "audit.csv")!;
    const deferred = out.files.find((f) => f.path === "deferred.csv")!;
    assert.match(audit.data.toString("utf8"), /^"id","table_name"/);
    assert.match(deferred.data.toString("utf8"), /^"id","table_name"/);
  });

  it("uses generated_at default when omitted", () => {
    const before = Date.now();
    const out = buildErasureAuditBundle({
      request: req(),
      audit: [],
      deferred: [],
    });
    const after = Date.now();
    const t = Date.parse(out.manifest.generated_at);
    assert.ok(t >= before && t <= after);
  });
});

describe("buildErasureAuditZip", () => {
  it("returns a Buffer plus digest + manifest", () => {
    const out = buildErasureAuditZip({
      request: req(),
      audit: [auditRow()],
      deferred: [],
      generated_at: FIXED_DATE,
    });
    assert.ok(Buffer.isBuffer(out.buffer));
    assert.ok(out.buffer.length > 22);
    assert.match(out.digest, /^[0-9a-f]{64}$/);
    assert.equal(out.manifest.request_id, "req-123");
  });
});
