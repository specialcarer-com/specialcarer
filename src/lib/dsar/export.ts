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
      // Columns removed in-app after the fetch (credentials, staff notes).
      strip?: string[];
    }
  | {
      // OR of multiple owner columns (e.g. bookings.seeker_id OR
      // bookings.carer_id both point at the same person from different
      // angles).
      table: string;
      owner_cols: string[];
      columns?: string;
      label?: string;
      strip?: string[];
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
  {
    table: "profiles",
    owner_col: "id",
    label: "Account profile",
    // `calendar_token` is a secret feed URL token, not information about
    // the subject; it is not released in a file that gets emailed.
    strip: ["calendar_token"],
  },
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
    strip: ["token", "verified_by", "admin_notes", "ip_address", "user_agent"],
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
  // ---- Added in 1.3.0 (see data-map.ts for the decision on every table) ----
  { table: "account_deletion_jobs", owner_col: "user_id", label: "Account deletion requests", strip: ["verification_token_hash"] },
  { table: "agency_optin_audit_log", owner_col: "carer_id", label: "Agency opt-in change log" },
  { table: "background_checks", owner_col: "user_id", label: "Background checks", strip: ["raw", "invite_url"] },
  { table: "blocked_caregivers", owner_col: "seeker_id", label: "Carers the subject has blocked" },
  { table: "booking_match_offers", owner_col: "carer_id", label: "Booking offers sent to the subject" },
  { table: "booking_payouts", owner_col: "payee_user_id", label: "Booking payouts" },
  { table: "caregiver_availability", owner_col: "user_id", label: "Weekly availability" },
  { table: "caregiver_availability_slots", owner_col: "user_id", label: "Availability slots" },
  { table: "caregiver_blockouts", owner_col: "user_id", label: "Blocked-out dates" },
  { table: "caregiver_certifications", owner_col: "caregiver_id", label: "Certifications (profile)" },
  { table: "caregiver_instant_settings", owner_col: "user_id", label: "Instant-booking settings" },
  { table: "caregiver_photos", owner_col: "caregiver_id", label: "Profile photos" },
  { table: "caregiver_rates_cache", owner_col: "carer_id", label: "Response and completion rates used in matching" },
  { table: "caregiver_stage_history", owner_col: "caregiver_id", label: "Onboarding stage history", strip: ["note"] },
  { table: "caregiver_stripe_accounts", owner_col: "user_id", label: "Payout account (Stripe)" },
  { table: "caregiver_timeoff_requests", owner_col: "user_id", label: "Time-off requests" },
  { table: "carer_certifications", owner_col: "carer_id", label: "Certifications (uploaded)" },
  { table: "carer_course_progress", owner_col: "carer_id", label: "Course progress" },
  { table: "carer_holiday_pots", owner_col: "carer_id", label: "Holiday pot balances" },
  { table: "carer_interview_submissions", owner_col: "carer_id", label: "Interview video submissions (file paths only)" },
  { table: "carer_memberships", owner_col: "carer_user_id", label: "Carer membership" },
  { table: "carer_preferred_clients", owner_col: "carer_id", label: "Preferred clients" },
  { table: "carer_qualifications", owner_col: "carer_id", label: "Qualifications" },
  { table: "carer_reference_consents", owner_col: "carer_id", label: "Reference consent forms", strip: ["signature_data_url"] },
  { table: "carer_referral_codes", owner_col: "owner_id", label: "Carer referral codes" },
  { table: "carer_saved_searches", owner_col: "carer_id", label: "Saved searches" },
  { table: "carer_skills_attempts", owner_col: "carer_id", label: "Skills test attempts" },
  { table: "dbs_applications", owner_col: "carer_id", label: "DBS applications", strip: ["surname_override_by", "surname_override_reason"] },
  { table: "dsar_requests", owner_col: "subject_user_id", label: "Data requests made by the subject", strip: ["verification_token_hash"] },
  { table: "emergency_contacts", owner_col: "owner_id", label: "Emergency contacts" },
  { table: "families", owner_col: "primary_user_id", label: "Family groups owned by the subject" },
  { table: "family_members", owner_col: "user_id", label: "Family group memberships" },
  { table: "forum_posts", owner_col: "author_user_id", label: "Forum posts" },
  { table: "forum_threads", owner_col: "author_user_id", label: "Forum threads" },
  { table: "forum_reports", owner_col: "reporter_user_id", label: "Forum reports made by the subject" },
  { table: "holiday_leave_requests", owner_col: "carer_id", label: "Holiday pay requests", strip: ["admin_notes", "admin_id"] },
  { table: "holiday_pot_ledger", owner_col: "carer_id", label: "Holiday pot ledger" },
  { table: "household_recipients", owner_col: "owner_id", label: "People the subject arranges care for" },
  { table: "identity_verifications", owner_col: "user_id", label: "Identity verifications", strip: ["verification_url"] },
  { table: "interviews", owner_col: "carer_id", label: "Interviews" },
  { table: "kyc_escalations", owner_col: "user_id", label: "Identity check escalations", strip: ["notes", "decided_by", "decided_by_email"] },
  { table: "leave_requests", owner_col: "carer_user_id", label: "Shift leave requests", strip: ["admin_notes", "resolved_by"] },
  { table: "live_in_requests", owner_col: "user_id", label: "Live-in care requests" },
  { table: "notifications", owner_col: "user_id", label: "Notifications" },
  { table: "org_booking_offers", owner_col: "carer_id", label: "Organisation booking offers" },
  { table: "org_carer_payouts", owner_col: "carer_id", label: "Payslips and payroll records" },
  { table: "org_membership_audit", owner_col: "target_user_id", label: "Organisation role changes affecting the subject" },
  { table: "organization_members", owner_col: "user_id", label: "Organisation memberships" },
  { table: "outreach_email_log", owner_col: "caregiver_id", label: "Outreach emails sent to the subject" },
  { table: "payout_alerts", owner_col: "carer_id", label: "Payout alerts", strip: ["notes"] },
  { table: "payout_intents", owner_col: "carer_id", label: "Instant payout requests" },
  { table: "payouts", owner_col: "caregiver_id", label: "Payouts" },
  { table: "push_tokens", owner_col: "user_id", label: "Registered devices", strip: ["token"] },
  { table: "referral_codes", owner_col: "user_id", label: "Referral codes" },
  { table: "referral_credits", owner_col: "user_id", label: "Referral credits" },
  { table: "review_private_feedback", owner_col: "reviewer_id", label: "Private feedback the subject wrote" },
  { table: "safety_reports", owner_col: "reporter_user_id", label: "Safety reports the subject filed", strip: ["admin_notes", "resolved_by"] },
  { table: "seeker_ratings", owner_col: "caregiver_id", label: "Ratings the subject wrote about clients" },
  { table: "service_requests", owner_col: "seeker_id", label: "Service requests" },
  { table: "shift_time_adjustments", owner_cols: ["proposer_user_id", "responder_user_id"], label: "Shift time adjustments" },
  { table: "shift_tracking_sessions", owner_cols: ["caregiver_id", "seeker_id"], label: "Shift tracking sessions" },
  { table: "shift_locations", owner_col: "caregiver_id", label: "Shift location pings" },
  { table: "carer_positions", owner_col: "carer_id", label: "Live position records" },
  { table: "visit_events", owner_col: "carer_id", label: "Clock-in and clock-out events", strip: ["admin_override_by", "admin_override_reason", "verified_by_admin_id", "verification_note"] },
  { table: "shift_timesheets", owner_col: "carer_id", label: "Timesheets (carer side)", strip: ["approver_user_id", "approver_ip", "approver_typed_reason", "dispute_admin_notes"] },
  { table: "sos_alerts", owner_col: "user_id", label: "SOS alerts" },
  { table: "subscriptions", owner_col: "user_id", label: "Subscriptions", strip: ["granted_by", "grant_reason"] },
  { table: "support_tickets", owner_col: "user_id", label: "Support tickets", strip: ["assigned_to"] },
  { table: "tax_documents", owner_col: "user_id", label: "Tax documents" },
  { table: "tips", owner_cols: ["payer_id", "caregiver_id"], label: "Tips" },
  { table: "training_enrollments", owner_col: "carer_id", label: "Training enrolments" },
];

/**
 * Child tables reached through a table the exporter has already read.
 * `parent` names that table; `fk` is the child column holding its id.
 * `care_plans` is special: only plans on bookings where the subject is
 * the seeker are used, because allergies and medications are the
 * recipient's health information.
 */
export type ChildSpec = {
  table: string;
  parent: string;
  fk: string;
  label: string;
  strip?: string[];
  seekerPlansOnly?: boolean;
  dropWhere?: { column: string; equals: unknown };
};
export const CHILD_TABLES: ChildSpec[] = [
  { table: "allergies", parent: "care_plans", fk: "care_plan_id", label: "Allergies on the subject's care plans", seekerPlansOnly: true },
  { table: "medications", parent: "care_plans", fk: "care_plan_id", label: "Medications on the subject's care plans", seekerPlansOnly: true },
  { table: "care_plan_reviews", parent: "care_plans", fk: "care_plan_id", label: "Care plan reviews", seekerPlansOnly: true },
  { table: "training_quiz_attempts", parent: "training_enrollments", fk: "enrollment_id", label: "Training quiz attempts" },
  { table: "support_messages", parent: "support_tickets", fk: "ticket_id", label: "Support messages (internal notes removed)", strip: ["internal_note"], dropWhere: { column: "internal_note", equals: true } },
  { table: "org_carer_payout_items", parent: "org_carer_payouts", fk: "payout_id", label: "Payslip line items" },
];

/**
 * Tables keyed by email address rather than user id: people who joined
 * a waiting list, were sourced as prospects, or were invited, and may
 * hold no account. Matched on the request's verified email address.
 */
export type EmailKeyedSpec = {
  table: string;
  email_col: string;
  label: string;
  strip?: string[];
};
export const EMAIL_KEYED_TABLES: EmailKeyedSpec[] = [
  { table: "waitlist", email_col: "email", label: "Waiting list entries" },
  { table: "carer_sourcing_prospects", email_col: "email", label: "Carer prospect records", strip: ["notes"] },
  { table: "carer_outreach_suppression", email_col: "email", label: "Outreach opt-outs", strip: ["notes"] },
  { table: "employer_leads", email_col: "work_email", label: "Employer enquiries" },
  { table: "org_leads", email_col: "work_email", label: "Organisation enquiries", strip: ["notes"] },
  { table: "organization_invitations", email_col: "email", label: "Organisation invitations sent to the subject", strip: ["token_hash"] },
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

/** Remove named columns from every row (credentials, staff notes). */
function stripColumns(rows: unknown[], strip?: string[]): unknown[] {
  if (!strip || strip.length === 0) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const key of strip) delete copy[key];
    return copy;
  });
}

/**
 * A single PostgREST request returns at most this many rows. The exporter
 * does not page, so a result of exactly this size may be incomplete and is
 * flagged in the manifest rather than passed off as complete.
 */
const REQUEST_ROW_LIMIT = 1000;
const TRUNCATION_NOTE = "possibly_incomplete_row_limit";

/** Ids per OR filter; keeps the request URL a safe length. */
const ID_CHUNK = 40;

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
//   1.3.0 — coverage (13 Oct 2026): exports every table the data map
//     (data-map.ts) marks as exported, 94 in all, up from 11. Adds child
//     tables, email-keyed tables, request chunking for large id lists,
//     a row-limit warning, and removes the profile calendar token.
const EXPORTER_VERSION = "dsar-export/1.3.0";

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
  fk = "booking_id",
): Promise<BookingLinkedFetch> {
  if (bookingIds.length === 0) return { kind: "empty" };
  const rows: unknown[] = [];
  for (let i = 0; i < bookingIds.length; i += ID_CHUNK) {
    const filter = bookingIds
      .slice(i, i + ID_CHUNK)
      .map((id) => `${fk}.eq.${id}`)
      .join(",");
    const { data, error } = await admin.from(table).select(columns).or(filter);
    if (error) {
      if (isSchemaNotReady(error)) return { kind: "schema_not_ready" };
      return { kind: "error", message: error.message };
    }
    rows.push(...(data ?? []));
  }
  return { kind: "ok", rows };
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

/** Every table the exporter reads. The data-map guard test compares this with data-map.ts. */
export const EXPORTED_TABLE_NAMES: ReadonlySet<string> = new Set([
  ...DSAR_TABLES.map((t) => t.table),
  ...CHILD_TABLES.map((t) => t.table),
  ...EMAIL_KEYED_TABLES.map((t) => t.table),
  "care_plans",
  "payments",
  "refund_ledger",
]);

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
    const rows = stripColumns(data ?? [], spec.strip);
    tables.push({
      table: spec.table,
      label,
      row_count: rows.length,
      rows,
      ...(rows.length >= REQUEST_ROW_LIMIT ? { note: TRUNCATION_NOTE } : {}),
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

  // Step 3: child tables reached through a parent already read.
  const seekerBookingSet = new Set(seekerBookingIds);
  for (const child of CHILD_TABLES) {
    const parentRow = tables.find((t) => t.table === child.parent);
    if (!parentRow || parentRow.error !== undefined || parentRow.note === "schema_not_ready") {
      tables.push({
        table: child.table,
        label: child.label,
        row_count: 0,
        ...(parentRow?.error !== undefined
          ? { error: `parent ${child.parent}: ${parentRow.error}` }
          : { note: "parent_unavailable" }),
      });
      continue;
    }
    const parentIds: string[] = [];
    for (const r of (parentRow.rows ?? []) as Array<Record<string, unknown>>) {
      if (typeof r.id !== "string") continue;
      if (child.seekerPlansOnly && !(typeof r.booking_id === "string" && seekerBookingSet.has(r.booking_id))) {
        continue;
      }
      parentIds.push(r.id);
    }
    const result = await fetchBookingLinkedRows(admin, child.table, "*", parentIds, child.fk);
    if (result.kind === "empty") {
      tables.push({ table: child.table, label: child.label, row_count: 0, rows: [] });
    } else if (result.kind === "schema_not_ready") {
      tables.push({ table: child.table, label: child.label, row_count: 0, note: "schema_not_ready" });
      notes.push(`Table ${child.table} is not present in this environment; skipped.`);
    } else if (result.kind === "error") {
      tables.push({ table: child.table, label: child.label, row_count: 0, error: result.message });
    } else {
      let rows = result.rows;
      if (child.dropWhere) {
        const { column, equals } = child.dropWhere;
        rows = rows.filter((r) => !(r && typeof r === "object" && (r as Record<string, unknown>)[column] === equals));
      }
      rows = stripColumns(rows, child.strip);
      tables.push({ table: child.table, label: child.label, row_count: rows.length, rows });
    }
  }

  // Step 4: tables keyed by the request's verified email address.
  const emailVariants = [...new Set([args.email, args.email.toLowerCase()])].filter(
    (e) => e.length > 0,
  );
  const emailUsable = emailVariants.every((e) => !/[,()]/.test(e));
  if (!emailUsable) {
    notes.push(
      "The request email contains characters the exporter cannot match safely; email-keyed tables were skipped. Contact the data protection lead.",
    );
  }
  for (const spec of EMAIL_KEYED_TABLES) {
    if (!emailUsable) {
      tables.push({ table: spec.table, label: spec.label, row_count: 0, note: "email_not_matchable" });
      continue;
    }
    const filter = emailVariants.map((e) => `${spec.email_col}.eq.${e}`).join(",");
    const { data, error } = await admin.from(spec.table).select("*").or(filter);
    if (error) {
      if (isSchemaNotReady(error)) {
        tables.push({ table: spec.table, label: spec.label, row_count: 0, note: "schema_not_ready" });
        notes.push(`Table ${spec.table} is not present in this environment; skipped.`);
      } else {
        tables.push({ table: spec.table, label: spec.label, row_count: 0, error: error.message });
      }
      continue;
    }
    const rows = stripColumns(data ?? [], spec.strip);
    tables.push({ table: spec.table, label: spec.label, row_count: rows.length, rows });
  }

  const truncated = tables.filter((t) => t.note === TRUNCATION_NOTE).map((t) => t.table);
  if (truncated.length > 0) {
    notes.push(
      `These tables returned ${REQUEST_ROW_LIMIT} rows, the most one request can return, so they may be incomplete: ${truncated.join(", ")}.`,
    );
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
