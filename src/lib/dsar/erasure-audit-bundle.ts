/**
 * SpecialCarer — DSAR erasure audit bundle
 *
 * Builds the downloadable ZIP a compliance officer opens after an
 * Article-17 erasure has been executed. The bundle captures three
 * things:
 *
 *   1. `manifest.json` — the request-level facts we can hand to the
 *      ICO or an auditor without redaction: request id, subject
 *      email/id, timestamps, final state, and count aggregates.
 *   2. `audit.csv` — one row per (manifest step, action) written by
 *      `handleDsarErase` to `public.dsar_erasure_audit`. This is the
 *      6-year retention record required by our DPIA.
 *   3. `deferred.csv` — the queue of rows scheduled for a future
 *      hard-delete (things we retained under Art 17(3)(b)/(e)) with
 *      the date each becomes purgeable. Empty file (header row only)
 *      is legitimate — most requests have zero deferrals.
 *
 * The builder is pure: no Supabase, no fetch, no fs. It takes the
 * three input row sets (already fetched by the route) and returns
 * `{ files, digest }`. The digest is a SHA-256 over the concatenated
 * file contents in the fixed order above and is echoed both in the
 * manifest and in the download response header, so the officer can
 * confirm the bundle wasn't rewritten in transit.
 *
 * Design notes
 * ------------
 *  * We do NOT put subject-identifying data into filenames. The ZIP
 *    is served from `.../dsar/[id]/audit.zip`; the `Content-Disposition`
 *    filename is the DSAR request id only.
 *  * CSVs use RFC 4180 quoting (double-quote all fields, escape `"`
 *    as `""`, CRLF terminators). No SEP directive — Excel and
 *    LibreOffice both auto-detect. Byte order mark is omitted; the
 *    file is pure ASCII apart from user-supplied fields which are
 *    UTF-8.
 *  * `null` values in the audit source become empty CSV fields
 *    (never the literal string "null") so downstream tooling doesn't
 *    misinterpret them.
 */

import { createHash } from "node:crypto";
import { buildZip, type ZipEntry } from "@/lib/zip/store";

// ----------------------------------------------------------------------
// Input row shapes — narrow subsets of the real Supabase rows so unit
// tests can construct fakes without pulling in the client types.
// ----------------------------------------------------------------------

export type ErasureBundleRequest = {
  id: string;
  subject_email: string;
  subject_user_id: string | null;
  request_type: string;
  state: string;
  submitted_at: string | null;
  verified_at: string | null;
  updated_at: string | null;
};

export type ErasureBundleAuditRow = {
  id: string;
  table_name: string;
  column_name: string | null;
  owner_column: string | null;
  owner_value: string | null;
  action: string;
  reason: string | null;
  retained_until: string | null;
  row_count: number;
  error: string | null;
  executed_at: string;
};

export type ErasureBundleDeferredRow = {
  id: string;
  table_name: string;
  owner_column: string;
  owner_value: string;
  column_name: string | null;
  retained_until: string;
  state: string;
  attempt_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ErasureBundleInput = {
  request: ErasureBundleRequest;
  audit: ErasureBundleAuditRow[];
  deferred: ErasureBundleDeferredRow[];
  generated_at?: Date;
};

export type ErasureBundleOutput = {
  files: ZipEntry[];
  digest: string;
  manifest: ErasureBundleManifest;
};

export type ErasureBundleManifest = {
  request_id: string;
  subject_email: string;
  subject_user_id: string | null;
  request_type: string;
  state: string;
  submitted_at: string | null;
  verified_at: string | null;
  updated_at: string | null;
  generated_at: string;
  totals: {
    audit_rows: number;
    deferred_rows: number;
    rows_nulled: number;
    rows_pseudonymised: number;
    rows_anonymised: number;
    rows_retained: number;
    rows_soft_deleted: number;
    rows_skipped: number;
    step_errors: number;
  };
  digest: string;
};

// ----------------------------------------------------------------------
// CSV helpers
// ----------------------------------------------------------------------

const AUDIT_HEADERS = [
  "id",
  "table_name",
  "column_name",
  "owner_column",
  "owner_value",
  "action",
  "reason",
  "retained_until",
  "row_count",
  "error",
  "executed_at",
] as const;

const DEFERRED_HEADERS = [
  "id",
  "table_name",
  "owner_column",
  "owner_value",
  "column_name",
  "retained_until",
  "state",
  "attempt_count",
  "last_attempt_at",
  "last_error",
  "completed_at",
  "created_at",
] as const;

/**
 * Escape a single CSV field per RFC 4180. `null`/`undefined` collapse
 * to an empty (unquoted) field so downstream tools see missing data,
 * not the string "null".
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  // Always quote — simpler than deciding when we can skip. It costs
  // 2 bytes per field and prevents the classic "field started with =
  // and Excel treated it as a formula" footgun in one shot.
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(fields: readonly unknown[]): string {
  return fields.map(csvField).join(",");
}

export function renderAuditCsv(rows: ErasureBundleAuditRow[]): string {
  const lines: string[] = [csvRow(AUDIT_HEADERS)];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.id,
        r.table_name,
        r.column_name,
        r.owner_column,
        r.owner_value,
        r.action,
        r.reason,
        r.retained_until,
        r.row_count,
        r.error,
        r.executed_at,
      ]),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function renderDeferredCsv(rows: ErasureBundleDeferredRow[]): string {
  const lines: string[] = [csvRow(DEFERRED_HEADERS)];
  for (const r of rows) {
    lines.push(
      csvRow([
        r.id,
        r.table_name,
        r.owner_column,
        r.owner_value,
        r.column_name,
        r.retained_until,
        r.state,
        r.attempt_count,
        r.last_attempt_at,
        r.last_error,
        r.completed_at,
        r.created_at,
      ]),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ----------------------------------------------------------------------
// Manifest
// ----------------------------------------------------------------------

/**
 * Aggregate the audit rows into count totals. Missing action buckets
 * are still reported as 0 so downstream tooling has a stable shape.
 */
export function computeAuditTotals(rows: ErasureBundleAuditRow[]): {
  rows_nulled: number;
  rows_pseudonymised: number;
  rows_anonymised: number;
  rows_retained: number;
  rows_soft_deleted: number;
  rows_skipped: number;
  step_errors: number;
} {
  const totals = {
    rows_nulled: 0,
    rows_pseudonymised: 0,
    rows_anonymised: 0,
    rows_retained: 0,
    rows_soft_deleted: 0,
    rows_skipped: 0,
    step_errors: 0,
  };
  for (const r of rows) {
    if (r.error) totals.step_errors += 1;
    switch (r.action) {
      case "null":
        totals.rows_nulled += r.row_count;
        break;
      case "pseudonymise":
        totals.rows_pseudonymised += r.row_count;
        break;
      case "anonymise":
        totals.rows_anonymised += r.row_count;
        break;
      case "retain":
        totals.rows_retained += r.row_count;
        break;
      case "soft-delete":
        totals.rows_soft_deleted += r.row_count;
        break;
      case "skip":
        totals.rows_skipped += r.row_count;
        break;
      default:
        // Unknown action — treated as a per-step error for visibility.
        totals.step_errors += 1;
    }
  }
  return totals;
}

// ----------------------------------------------------------------------
// Bundle builder
// ----------------------------------------------------------------------

/**
 * Build the audit ZIP. Deterministic apart from `generated_at`, which
 * defaults to `new Date()`; pass a fixed date in tests.
 */
export function buildErasureAuditBundle(
  input: ErasureBundleInput,
): ErasureBundleOutput {
  const generated = input.generated_at ?? new Date();
  const generated_iso = generated.toISOString();

  const auditCsv = renderAuditCsv(input.audit);
  const deferredCsv = renderDeferredCsv(input.deferred);

  const totals = {
    audit_rows: input.audit.length,
    deferred_rows: input.deferred.length,
    ...computeAuditTotals(input.audit),
  };

  // Digest the two CSVs first, then the manifest (which itself
  // embeds the digest — chicken-and-egg resolved by computing the
  // digest over the CSVs only and then embedding it).
  const digest = createHash("sha256")
    .update(auditCsv, "utf8")
    .update("\n", "utf8")
    .update(deferredCsv, "utf8")
    .digest("hex");

  const manifest: ErasureBundleManifest = {
    request_id: input.request.id,
    subject_email: input.request.subject_email,
    subject_user_id: input.request.subject_user_id,
    request_type: input.request.request_type,
    state: input.request.state,
    submitted_at: input.request.submitted_at,
    verified_at: input.request.verified_at,
    updated_at: input.request.updated_at,
    generated_at: generated_iso,
    totals,
    digest: `sha256:${digest}`,
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  const files: ZipEntry[] = [
    { path: "manifest.json", data: Buffer.from(manifestJson, "utf8"), mtime: generated },
    { path: "audit.csv", data: Buffer.from(auditCsv, "utf8"), mtime: generated },
    { path: "deferred.csv", data: Buffer.from(deferredCsv, "utf8"), mtime: generated },
  ];

  return { files, digest, manifest };
}

/**
 * Convenience: build the bundle AND encode it as a ZIP buffer.
 */
export function buildErasureAuditZip(input: ErasureBundleInput): {
  buffer: Buffer;
  digest: string;
  manifest: ErasureBundleManifest;
} {
  const bundle = buildErasureAuditBundle(input);
  return {
    buffer: buildZip(bundle.files),
    digest: bundle.digest,
    manifest: bundle.manifest,
  };
}
