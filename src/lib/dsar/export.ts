/**
 * SpecialCarer — DSAR subject data export
 *
 * Enumerates all rows owned by (or that reference) a single data subject
 * across the public schema, so a UK-GDPR Article 15 access request or
 * an Article 20 portability request can be fulfilled with a machine-
 * readable JSON archive.
 *
 * Design contract
 * ---------------
 *  * We enumerate a *fixed set* of tables here rather than reflecting
 *    the schema at runtime. Reflection would leak newly added tables
 *    to the subject before we've done a legal review of what to
 *    include; the manual list forces a deliberate opt-in per table.
 *  * Every table is queried with a filter that references the subject's
 *    user id — never a scan-then-filter-in-app. Anything that doesn't
 *    have a clean user-id column stays out of the export until we've
 *    modelled its ownership properly (documented as `deferred` below).
 *  * Errors on individual tables never abort the export. A missing
 *    table (e.g. running against a schema that doesn't have the newest
 *    B4 addition yet) becomes a `schema_not_ready` note in the manifest
 *    instead of a thrown exception — the export still delivers whatever
 *    was available and the subject can request again once the schema
 *    is aligned.
 *
 * The output is a JSON document with the shape:
 *
 *   {
 *     subject: { user_id, email, generated_at },
 *     tables: {
 *       [tableName]: { row_count, rows | error }
 *     },
 *     notes: string[]
 *   }
 *
 * The fulfilment cron wraps this in a zip and uploads to Supabase
 * Storage; the subject receives a signed URL.
 */

import { createHash } from "node:crypto";

// Minimal interface the caller must satisfy. Kept narrow so tests can
// pass a hand-rolled fake without pulling in the real Supabase client
// (which would drag Postgres + fetch into unit tests). The real caller
// passes `createAdminClient()` from `@/lib/supabase/admin`.
export type ExportAdminClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{
        data: unknown[] | null;
        error: { message: string; code?: string } | null;
      }>;
      or(filter: string): Promise<{
        data: unknown[] | null;
        error: { message: string; code?: string } | null;
      }>;
    };
  };
};

type TableSpec =
  | {
      // Simple owner column: select where owner_col = subject_user_id.
      table: string;
      owner_col: string;
      columns?: string; // defaults to "*"
      label?: string;
    }
  | {
      // OR of multiple owner columns (e.g. bookings.seeker_id OR
      // bookings.carer_id both point at the same person from different
      // angles).
      table: string;
      owner_cols: string[];
      columns?: string;
      label?: string;
    };

/**
 * The manifest of tables we export. Ordered roughly by centrality so
 * the resulting JSON reads sensibly.
 *
 * Deliberately deferred (need modelling / legal input before we
 * enumerate):
 *   - `messages` / `chat_messages` — need consent from the *other*
 *     participant before releasing shared threads. Separate DSAR
 *     workflow.
 *   - `admin_audit_log` — includes staff PII; needs redaction pass.
 *   - `interview_rooms` / `whereby_*` — recordings held for a
 *     retention window with the vendor; export links, not blobs.
 *   - `payments` — the raw Stripe rows leak counterparty ids. Instead
 *     we expose a purpose-built projection (see PAYMENT_PROJECTION
 *     below) rather than dumping the row.
 *
 * When new user-owned tables land, add them here in the same PR that
 * creates the table so the DSAR export doesn't silently omit them.
 */
export const DSAR_TABLES: TableSpec[] = [
  { table: "profiles", owner_col: "id", label: "Account profile" },
  {
    table: "caregiver_profiles",
    owner_col: "user_id",
    label: "Caregiver profile",
  },
  {
    table: "bookings",
    owner_cols: ["seeker_id", "carer_id"],
    label: "Bookings (as seeker or carer)",
  },
  {
    table: "refund_ledger",
    owner_col: "booking_id",
    label: "Refund events (linked via bookings)",
    // NOTE: this is filtered by booking id at the cron layer rather
    // than in the direct query; the enumeration below runs against
    // the subject id directly for the simple cases. See
    // `exportSubject` for the two-step handling.
  },
  {
    table: "references",
    owner_col: "carer_user_id",
    label: "Employment references submitted for the subject",
  },
  {
    table: "caregiver_documents",
    owner_col: "user_id",
    label: "Uploaded compliance documents",
  },
  {
    table: "dbs_change_events",
    owner_col: "user_id",
    label: "DBS update-service history",
  },
  {
    table: "care_plans",
    owner_col: "seeker_id",
    label: "Care plans the subject is on",
  },
  {
    table: "reviews",
    owner_cols: ["reviewer_id", "subject_user_id"],
    label: "Reviews written by or about the subject",
  },
  {
    table: "saved_caregivers",
    owner_col: "user_id",
    label: "Saved caregivers list",
  },
];

// Payment rows are enumerated separately because we project to a
// safe subset — we do not dump raw Stripe object ids of counterparties.
const PAYMENT_PROJECTION =
  "id, booking_id, amount_cents, currency, status, created_at, refunded_amount_cents";

export type ExportedTable = {
  table: string;
  label: string;
  row_count: number;
  rows?: unknown[];
  error?: string;
  note?: string;
};

export type SubjectExport = {
  subject: {
    user_id: string;
    email: string;
    generated_at: string;
    exporter_version: string;
    digest: string;
  };
  tables: ExportedTable[];
  notes: string[];
};

const EXPORTER_VERSION = "dsar-export/1.0.0";

const UNDEFINED_TABLE = "42P01"; // Postgres error code

function isSchemaNotReady(err: { code?: string; message?: string }): boolean {
  return (
    err.code === UNDEFINED_TABLE ||
    /relation .* does not exist/i.test(err.message ?? "")
  );
}

/**
 * Run the export for a single subject. Returns a plain-object structure
 * ready to be JSON-stringified into the zip.
 */
export async function exportSubject(
  admin: ExportAdminClient,
  args: { user_id: string; email: string },
): Promise<SubjectExport> {
  const notes: string[] = [];
  const tables: ExportedTable[] = [];

  // Step 1: enumerate the simple owner-column tables (skip refund_ledger,
  // which is a two-step lookup via bookings).
  for (const spec of DSAR_TABLES) {
    if (spec.table === "refund_ledger") continue;
    const label = spec.label ?? spec.table;
    const columns = "columns" in spec ? (spec.columns ?? "*") : "*";

    const query = admin.from(spec.table).select(columns);
    const promise =
      "owner_cols" in spec
        ? query.or(spec.owner_cols.map((c) => `${c}.eq.${args.user_id}`).join(","))
        : query.eq(spec.owner_col, args.user_id);

    const { data, error } = await promise;
    if (error) {
      if (isSchemaNotReady(error)) {
        tables.push({
          table: spec.table,
          label,
          row_count: 0,
          note: "schema_not_ready",
        });
        notes.push(
          `Table ${spec.table} is not present in this environment; skipped.`,
        );
      } else {
        tables.push({
          table: spec.table,
          label,
          row_count: 0,
          error: error.message,
        });
      }
      continue;
    }
    const rows = data ?? [];
    tables.push({
      table: spec.table,
      label,
      row_count: rows.length,
      rows,
    });
  }

  // Step 2: payments — projected subset.
  {
    const { data, error } = await admin
      .from("payments")
      .select(PAYMENT_PROJECTION)
      .or(`payer_id.eq.${args.user_id},payee_id.eq.${args.user_id}`);
    if (error) {
      if (isSchemaNotReady(error)) {
        tables.push({
          table: "payments",
          label: "Payments (payer or payee)",
          row_count: 0,
          note: "schema_not_ready",
        });
      } else {
        tables.push({
          table: "payments",
          label: "Payments (payer or payee)",
          row_count: 0,
          error: error.message,
        });
      }
    } else {
      const rows = data ?? [];
      tables.push({
        table: "payments",
        label: "Payments (payer or payee)",
        row_count: rows.length,
        rows,
      });
    }
  }

  // Step 3: refund_ledger via booking ids collected in step 1.
  {
    const bookingsRow = tables.find((t) => t.table === "bookings");
    const bookingIds = ((bookingsRow?.rows ?? []) as Array<{ id?: string }>)
      .map((b) => b.id)
      .filter((id): id is string => typeof id === "string");
    if (bookingIds.length === 0) {
      tables.push({
        table: "refund_ledger",
        label: "Refund events (via bookings)",
        row_count: 0,
        rows: [],
      });
    } else {
      // We use an OR of booking_id.eq clauses so the same fake client
      // interface works for testing without pulling in `in`. In real
      // Supabase this compiles to a WHERE booking_id IN (...) via
      // PostgREST's `or` operator.
      const filter = bookingIds.map((id) => `booking_id.eq.${id}`).join(",");
      const { data, error } = await admin
        .from("refund_ledger")
        .select("*")
        .or(filter);
      if (error) {
        if (isSchemaNotReady(error)) {
          tables.push({
            table: "refund_ledger",
            label: "Refund events (via bookings)",
            row_count: 0,
            note: "schema_not_ready",
          });
          notes.push(
            "refund_ledger not yet present in this environment; refund history is empty in this export.",
          );
        } else {
          tables.push({
            table: "refund_ledger",
            label: "Refund events (via bookings)",
            row_count: 0,
            error: error.message,
          });
        }
      } else {
        const rows = data ?? [];
        tables.push({
          table: "refund_ledger",
          label: "Refund events (via bookings)",
          row_count: rows.length,
          rows,
        });
      }
    }
  }

  // Sanity fingerprint. Not a cryptographic commitment — just something
  // the subject can quote back if they later say "the export was
  // modified". Hash of the manifest structure + row counts (not row
  // contents, to keep the digest stable across identical exports).
  const digestSource = JSON.stringify(
    tables.map((t) => [t.table, t.row_count, t.error ?? t.note ?? "ok"]),
  );
  const digest = createHash("sha256")
    .update(digestSource)
    .digest("hex")
    .slice(0, 16);

  return {
    subject: {
      user_id: args.user_id,
      email: args.email,
      generated_at: new Date().toISOString(),
      exporter_version: EXPORTER_VERSION,
      digest,
    },
    tables,
    notes,
  };
}
