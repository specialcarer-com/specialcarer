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
 *     we expose role-aware projections (see PAYMENT_PROJECTION_SEEKER
 *     and PAYMENT_PROJECTION_CARER below) rather than dumping the row.
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
    // Live schema: booking parties are `seeker_id` and `caregiver_id`
    // (there is also `preferred_carer_id` but that only records a
    // preference — the actual party columns are the two above).
    table: "bookings",
    owner_cols: ["seeker_id", "caregiver_id"],
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
    // Live schema: `carer_references` (the older `references` name was
    // renamed). Subject FK is `carer_id`. Secret / staff-only columns
    // (`token`, `verified_by`, `admin_notes`, `ip_address`,
    // `user_agent`) are omitted from the export.
    table: "carer_references",
    owner_col: "carer_id",
    // See CARER_REFERENCES_EXCLUDED below — secrets are stripped from
    // each row after the fetch rather than in the select list, because
    // the table has 47 columns and hand-maintaining an allow-list is
    // fragile as the schema grows. See `stripReferenceSecrets`.
    columns: "*",
    label: "Employment references submitted for the subject",
  },
  {
    // Live schema: `compliance_documents` (was `caregiver_documents`).
    // Subject FK is `caregiver_id`. All columns are safe to include —
    // `verified_by` is the reviewing admin's id, kept in because a
    // subject is entitled to know who verified their submissions.
    table: "compliance_documents",
    owner_col: "caregiver_id",
    columns:
      "id, caregiver_id, doc_type, status, file_url, issued_at, expires_at, verified_by, verified_at, notes, created_at, updated_at",
    label: "Uploaded compliance documents",
  },
  {
    // Live schema: subject FK is `carer_id` (was `user_id`). Admin-
    // only fields (`admin_reviewer_id`, `admin_notes`) are omitted —
    // those are staff notes *about* the subject, not owned by them.
    table: "dbs_change_events",
    owner_col: "carer_id",
    columns:
      "id, carer_id, detected_at, source, prior_status, new_status, raw_payload, admin_reviewed_at, admin_decision",
    label: "DBS update-service history",
  },
  {
    // Live schema: `reviews` has `reviewer_id` and `caregiver_id` — a
    // review names the subject in either role. `hidden_by` is admin
    // PII and is omitted.
    table: "reviews",
    owner_cols: ["reviewer_id", "caregiver_id"],
    columns:
      "id, booking_id, reviewer_id, caregiver_id, rating, body, created_at, hidden_at, hidden_reason, rating_punctuality, rating_communication, rating_care_quality, rating_cleanliness, tags",
    label: "Reviews written by or about the subject",
  },
  {
    // Live schema: column is `seeker_id` (was `user_id`).
    table: "saved_caregivers",
    owner_col: "seeker_id",
    label: "Saved caregivers list",
  },
];

// `care_plans` and `payments` are enumerated via a booking-id join
// rather than a direct owner column, because neither table carries a
// subject FK. See the two-step handling in `exportSubject` below.
//
// Both tables carry data that spans TWO parties (a seeker and a
// caregiver). Under UK-GDPR Article 15 the subject is entitled to
// their own personal data only — not the counterparty's. So each
// booking-linked lookup runs role-aware: we track whether the subject
// appears on the parent booking as seeker or caregiver and apply the
// projection that maps to that role. See ICO right-of-access
// guidance (subject's own data only, not third parties).

// Care plans carry the *recipient's* identity (name, DoB, home
// address) alongside operational care instructions. When the subject
// is the seeker they entered — and are entitled to — the full row;
// when the subject is only the carer on the booking, the recipient
// identity/address belongs to the seeker (or their family member),
// not the carer.
//
// Rationale: "A carer is entitled to know the operational care
// instructions on plans they delivered against, but the recipient's
// identity, DoB, and address are personal data belonging to the
// seeker/recipient and are not disclosable to the carer under
// Article 15."
const CARE_PLAN_PROJECTION_SEEKER =
  "id, booking_id, recipient_name, recipient_dob, address_line1, address_line2, city, postcode, goals, special_instructions, routine_notes, created_by, created_at, updated_at";
const CARE_PLAN_PROJECTION_CARER =
  "id, booking_id, goals, special_instructions, routine_notes, created_at, updated_at";

// `carer_references` has 47 columns; rather than hand-maintaining an
// allow-list, we fetch everything and strip these secrets/forensic
// fields in-app before including the rows in the export.
const CARER_REFERENCES_EXCLUDED = [
  "token",
  "verified_by",
  "admin_notes",
  "ip_address",
  "user_agent",
];

// Payment rows are enumerated separately because we project to a
// safe subset — `raw` (the full Stripe webhook payload) and
// `hsa_tagged_by` (admin id) are excluded. Refund totals no longer
// live on `payments`; the refund state is exposed via `bookings`
// (`refunded_amount_cents`, `refund_reason`, `refund_status`) and the
// per-event `refund_ledger`, both already in the manifest.
//
// Payment records span two parties; a DSAR subject sees only the
// fields attributable to their role on the payment (payer OR payee),
// not the counterparty's Stripe identifiers or the platform's fee.
// `application_fee_cents` is platform-owned and excluded from both
// projections. HSA fields are seeker-side tax categorisation.
const PAYMENT_PROJECTION_SEEKER =
  "id, booking_id, stripe_payment_intent_id, stripe_charge_id, status, amount_cents, currency, kind, parent_payment_id, timesheet_id, hsa_eligible, hsa_tagged_at, created_at, updated_at";
const PAYMENT_PROJECTION_CARER =
  "id, booking_id, stripe_transfer_id, destination_account_id, status, amount_cents, currency, kind, parent_payment_id, timesheet_id, created_at, updated_at";

function stripReferenceSecrets(rows: unknown[]): unknown[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const key of CARER_REFERENCES_EXCLUDED) {
      delete copy[key];
    }
    return copy;
  });
}

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

// Version log:
//   1.0.0 — initial exporter (16 Sep 2026).
//   1.1.0 — schema-drift repair (17 Sep 2026): renamed
//     `references` → `carer_references`, `caregiver_documents` →
//     `compliance_documents`; retargeted `bookings.carer_id`,
//     `dbs_change_events.user_id`, `saved_caregivers.user_id`,
//     `reviews.subject_user_id`; moved `care_plans` and `payments`
//     to booking-linked enumeration. Prior versions silently emitted
//     `row_count: 0` with an `error` field for 8 of 11 tables.
//   1.2.0 — role-aware `care_plans` and `payments` projections
//     (17 Sep 2026). A carer on a booking no longer receives the
//     seeker/recipient's identity, DoB or address on care plans, and
//     payments now project only fields attributable to the subject's
//     role on the parent booking (payer vs payee Stripe ids).
const EXPORTER_VERSION = "dsar-export/1.2.0";

const UNDEFINED_TABLE = "42P01"; // Postgres error code

function isSchemaNotReady(err: { code?: string; message?: string }): boolean {
  return (
    err.code === UNDEFINED_TABLE ||
    /relation .* does not exist/i.test(err.message ?? "")
  );
}

/**
 * Fetch a booking-linked table filtered to a set of booking ids. The
 * caller decides which booking ids belong to which role (seeker vs
 * carer) and which projection to apply per role.
 *
 * Returns a discriminated result so the caller can merge multiple
 * role-scoped fetches into a single manifest entry (or surface the
 * failure once, not twice).
 */
type BookingLinkedFetch =
  | { kind: "empty" }
  | { kind: "ok"; rows: unknown[] }
  | { kind: "schema_not_ready" }
  | { kind: "error"; message: string };

async function fetchBookingLinkedRows(
  admin: ExportAdminClient,
  table: string,
  columns: string,
  bookingIds: string[],
): Promise<BookingLinkedFetch> {
  if (bookingIds.length === 0) return { kind: "empty" };
  const filter = bookingIds.map((id) => `booking_id.eq.${id}`).join(",");
  const { data, error } = await admin.from(table).select(columns).or(filter);
  if (error) {
    if (isSchemaNotReady(error)) return { kind: "schema_not_ready" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", rows: data ?? [] };
}

/**
 * Enumerate a table that has no direct subject FK by joining on the
 * subject's booking ids. We use an OR of `booking_id.eq.X` clauses —
 * this compiles to `WHERE booking_id IN (...)` at PostgREST and keeps
 * the narrow `ExportAdminClient` interface (only `eq` / `or`) intact,
 * which matters for the fake-client tests.
 *
 * For role-aware tables (care_plans, payments) the caller provides a
 * seeker projection and a carer projection with the booking ids the
 * subject appears on in each role. We run one fetch per non-empty
 * role-scope, apply the role-specific projection, and merge rows
 * (deduplicated by `id`) into a single manifest entry so the subject
 * sees one care_plans/payments table rather than two.
 *
 * For role-blind tables (refund_ledger) the caller provides only a
 * single scope with the union of booking ids.
 */
async function enumerateBookingLinked(
  admin: ExportAdminClient,
  tables: ExportedTable[],
  notes: string[],
  spec: {
    table: string;
    label: string;
    // At least one scope; each scope defines a projection and the
    // booking ids it applies to.
    scopes: Array<{ columns: string; bookingIds: string[] }>;
  },
): Promise<void> {
  // If none of the role-scoped booking sets have anything to query,
  // the exporter still needs to emit a manifest entry with 0 rows so
  // the subject knows we considered the table.
  const totalIds = spec.scopes.reduce((n, s) => n + s.bookingIds.length, 0);
  if (totalIds === 0) {
    tables.push({
      table: spec.table,
      label: spec.label,
      row_count: 0,
      rows: [],
    });
    return;
  }

  const merged: unknown[] = [];
  const seenIds = new Set<string>();
  for (const scope of spec.scopes) {
    const result = await fetchBookingLinkedRows(
      admin,
      spec.table,
      scope.columns,
      scope.bookingIds,
    );
    if (result.kind === "schema_not_ready") {
      tables.push({
        table: spec.table,
        label: spec.label,
        row_count: 0,
        note: "schema_not_ready",
      });
      notes.push(
        `${spec.table} not yet present in this environment; skipped.`,
      );
      return;
    }
    if (result.kind === "error") {
      tables.push({
        table: spec.table,
        label: spec.label,
        row_count: 0,
        error: result.message,
      });
      return;
    }
    if (result.kind === "empty") continue;
    for (const row of result.rows) {
      // Deduplicate by row id when the same row could match both a
      // seeker-scoped and carer-scoped fetch (shouldn't happen in
      // practice — a subject can't be both seeker and carer on the
      // same booking — but be defensive; take the FIRST projection
      // seen so the seeker-scoped columns win when we later choose to
      // order scopes seeker-first).
      const id =
        row && typeof row === "object" && "id" in row
          ? String((row as { id: unknown }).id)
          : undefined;
      if (id !== undefined) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      merged.push(row);
    }
  }

  tables.push({
    table: spec.table,
    label: spec.label,
    row_count: merged.length,
    rows: merged,
  });
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

  // Step 1: enumerate the simple owner-column tables. Tables linked
  // via bookings (refund_ledger, care_plans, payments) are handled in
  // step 2 below.
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
    const rawRows = data ?? [];
    const rows =
      spec.table === "carer_references"
        ? stripReferenceSecrets(rawRows)
        : rawRows;
    tables.push({
      table: spec.table,
      label,
      row_count: rows.length,
      rows,
    });
  }

  // Step 2: tables joined through bookings.
  //
  // `care_plans`, `payments` and `refund_ledger` all lack a direct
  // subject FK. We look them up by the booking ids we already fetched
  // in step 1. This keeps the `ExportAdminClient` interface narrow
  // (only `eq` / `or` are needed) and gives the same fake-client
  // support the tests rely on.
  //
  // If the bookings query itself failed in step 1 (error or
  // schema_not_ready), we surface that on every dependent table —
  // otherwise the subject would see `refund_ledger: { row_count: 0 }`
  // for a payments dispute they know they have, which is worse than
  // a visible error.
  const bookingsRow = tables.find((t) => t.table === "bookings");
  const bookingsFailure: { error?: string; note?: string } | null =
    bookingsRow?.error !== undefined
      ? { error: bookingsRow.error }
      : bookingsRow?.note !== undefined
        ? { note: bookingsRow.note }
        : null;

  // Split the subject's bookings by the role they hold on each one.
  // The bookings query already OR-joined on `seeker_id` and
  // `caregiver_id`, so every row here has the subject on at least one
  // side; a defensive check drops any row where neither side matches
  // (shouldn't happen, but a stale RLS policy is exactly the kind of
  // thing that would surface here).
  type BookingParties = {
    id?: string;
    seeker_id?: string;
    caregiver_id?: string;
  };
  const bookingRows = bookingsFailure
    ? []
    : ((bookingsRow?.rows ?? []) as BookingParties[]);
  const seekerBookingIds: string[] = [];
  const carerBookingIds: string[] = [];
  for (const b of bookingRows) {
    if (typeof b.id !== "string") continue;
    if (b.seeker_id === args.user_id) seekerBookingIds.push(b.id);
    if (b.caregiver_id === args.user_id) carerBookingIds.push(b.id);
  }
  const allBookingIds = [
    ...new Set([...seekerBookingIds, ...carerBookingIds]),
  ];

  const bookingLinked: Array<{
    table: string;
    label: string;
    scopes: Array<{ columns: string; bookingIds: string[] }>;
  }> = [
    {
      table: "care_plans",
      label: "Care plans on the subject's bookings",
      // Seeker scope first: when the subject is the seeker they get
      // the full row (recipient identity, address, care goals).
      // Carer scope second: a subject who is only the carer sees the
      // operational instructions without the recipient's PII.
      scopes: [
        {
          columns: CARE_PLAN_PROJECTION_SEEKER,
          bookingIds: seekerBookingIds,
        },
        {
          columns: CARE_PLAN_PROJECTION_CARER,
          bookingIds: carerBookingIds,
        },
      ],
    },
    {
      table: "payments",
      label: "Payments (linked via the subject's bookings)",
      // Same seeker-first ordering: payer-facing Stripe ids for the
      // seeker, payee-facing Stripe ids for the carer. Neither role
      // sees `application_fee_cents` (platform-owned).
      scopes: [
        {
          columns: PAYMENT_PROJECTION_SEEKER,
          bookingIds: seekerBookingIds,
        },
        {
          columns: PAYMENT_PROJECTION_CARER,
          bookingIds: carerBookingIds,
        },
      ],
    },
    {
      // Refund events are role-blind — both parties are entitled to
      // know a refund happened on their booking. One scope with the
      // union of booking ids.
      table: "refund_ledger",
      label: "Refund events (via bookings)",
      scopes: [{ columns: "*", bookingIds: allBookingIds }],
    },
  ];

  for (const spec of bookingLinked) {
    if (bookingsFailure) {
      tables.push({
        table: spec.table,
        label: spec.label,
        row_count: 0,
        ...bookingsFailure,
      });
      continue;
    }
    await enumerateBookingLinked(admin, tables, notes, spec);
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
