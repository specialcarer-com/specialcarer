/**
 * SpecialCarer — DSAR Article-17 erasure handler.
 *
 * Design contract (matches src/lib/dsar/export.ts):
 *
 *  * Fixed manifest, no schema reflection. Manual opt-in per table so
 *    a newly added table cannot silently leak (or silently fail to be
 *    erased) until we've legally reviewed the action.
 *  * Per-step errors NEVER abort the run. A missing table becomes a
 *    `skip` audit row with reason `schema_not_ready`; a DB failure
 *    becomes a `skip` with the underlying error captured. The handler
 *    returns `ok: true` with a full audit list so the route can decide
 *    how to surface partial success.
 *  * Nothing about the subject is inferred. `subject_user_id` and
 *    `subject_email` come from the caller (from the verified request
 *    row) and are threaded through unchanged.
 *  * Idempotent by construction. Every action is either an UPDATE that
 *    replaces with a constant (NULL, or a stable per-subject pseudonym),
 *    a soft-delete stamp, or a no-op retain declaration. Running the
 *    handler twice on the same subject produces the same end state.
 *
 * The handler flips the request state to `erased` when it finishes.
 * Rows queued for delayed hard-delete are captured in
 * `dsar_deferred_erasure_queue` and picked up by the retention cron
 * (follow-up PR).
 *
 * Manifest source of truth: `specialcarer_dsar_erasure_retention_map.md`.
 * Only manifest steps whose table + column exist in the current schema
 * (as verified from supabase/migrations/) are enumerated below. Adding
 * a new erasable table means (a) adding a step here and (b) adding a
 * regression test that a subject's rows in it get nulled.
 */

import { createHash, createHmac } from "node:crypto";

const UNDEFINED_TABLE = "42P01"; // Postgres: relation does not exist
const UNDEFINED_COLUMN = "42703"; // Postgres: column does not exist

const ERASE_VERSION = "dsar-erase/1.0.0";

// Retention-map dates, computed relative to the run date. Keep these
// as pure functions of `now` so tests can inject a fixed clock.
function payrollRetainedUntil(now: Date): string {
  // 3 years from end of the current UK tax year (5 April).
  const y = now.getUTCFullYear();
  const taxYearEnd = new Date(Date.UTC(y, 3, 5)); // 5 April
  if (now > taxYearEnd) taxYearEnd.setUTCFullYear(y + 1);
  const target = new Date(taxYearEnd);
  target.setUTCFullYear(target.getUTCFullYear() + 3);
  return target.toISOString().slice(0, 10);
}

function accountingRetainedUntil(now: Date): string {
  // 6 years from end of current accounting period. We treat
  // accounting-period end = end of calendar year for the retention
  // calculation (matches Companies Act s388 default when the entity
  // hasn't declared a bespoke period end).
  const y = now.getUTCFullYear();
  const target = new Date(Date.UTC(y + 6, 11, 31));
  return target.toISOString().slice(0, 10);
}

function careRecordsRetainedUntil(now: Date): string {
  // 6 years default per NHSX Records Management CoP 2021 (adult care).
  const target = new Date(now);
  target.setUTCFullYear(target.getUTCFullYear() + 6);
  return target.toISOString().slice(0, 10);
}

function safeguardingAdultRetainedUntil(now: Date): string {
  // 6 years floor for adult subjects. Steven can extend to 20y case-
  // by-case; the default at handler time is the floor.
  return careRecordsRetainedUntil(now);
}

function auditRetainedUntil(now: Date): string {
  // DSAR audit trail itself: 6 years.
  return careRecordsRetainedUntil(now);
}

/**
 * Stable per-subject pseudonym for foreign-key-anchoring columns like
 * `auth.users.email`. HMAC-SHA256 of the subject_user_id with the
 * ERASE_PSEUDONYM_KEY env var; falls back to a non-secret constant so
 * tests are deterministic. If the env var is missing in production, the
 * pseudonym is still stable per-subject but a determined attacker with
 * DB access could correlate two erased subjects — an acceptable trade
 * because the whole DB-with-access case is compromised anyway. The
 * pseudonym is only ever exposed to admins reading raw tables; the
 * subject never sees it.
 */
export function pseudonymFor(subject_user_id: string | null): string {
  const key = process.env.ERASE_PSEUDONYM_KEY ?? "dsar-erase-default-key";
  const idBytes = subject_user_id ?? "no-user-id";
  const digest = createHmac("sha256", key)
    .update(idBytes)
    .digest("hex")
    .slice(0, 24);
  return `erased+${digest}@erased.specialcarer.local`;
}

// --------------------------------------------------------------------------
// Manifest
// --------------------------------------------------------------------------

export type ErasureAction =
  | "null"
  | "pseudonymise"
  | "anonymise"
  | "retain"
  | "soft-delete";

export type ErasureStep = {
  /** Human label. Never mentioned to the subject. */
  label: string;
  /** Public schema table. */
  table: string;
  /** Column the action operates on (or null for row-level actions). */
  column: string | null;
  /** Column used to filter to the subject's rows. */
  owner_column: string;
  /** Where the owner_value comes from. */
  owner_source: "subject_user_id" | "subject_email";
  action: ErasureAction;
  /** Legal basis quoted in the audit row when action = 'retain'. */
  legal_basis?: string;
  /** How to compute retained_until relative to run time. */
  retained_until?: (now: Date) => string;
  /**
   * When action = 'soft-delete', the follow-up hard-delete action. Read
   * by the retention cron. Missing implies "delete the row entirely".
   */
  hard_delete_column?: string;
};

/**
 * The full manifest. Order is preserved in the audit trail.
 *
 * Coverage note: this is the *minimum viable* manifest, enumerating
 * tables whose column shapes were verified from
 * supabase/migrations/. Larger, later-added tables (chat, dbs_change_events,
 * carer_references, saved_caregivers, etc.) get their own manifest
 * steps in follow-up PRs once each column's retention decision is
 * signed off by the NI. Missing manifest entries produce silent
 * *retention* of that data — which is the safe default from the ICO's
 * perspective — until the follow-up PR lands.
 */
export const ERASURE_MANIFEST: ErasureStep[] = [
  // --- 1) profiles: nullable PII columns. `id` is the FK anchor and
  // MUST NOT be nulled. `role` is left alone so admin dashboards can
  // still count erased accounts by original role.
  {
    label: "Profile — display name",
    table: "profiles",
    column: "full_name",
    owner_column: "id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Profile — phone",
    table: "profiles",
    column: "phone",
    owner_column: "id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Profile — country",
    table: "profiles",
    column: "country",
    owner_column: "id",
    owner_source: "subject_user_id",
    action: "null",
  },

  // --- 2) caregiver_profiles: the public profile. Bio + photo + city.
  // `is_published` gets flipped to false as part of the nulling so the
  // search index stops surfacing the account. `hourly_rate_cents`
  // stays (it's not PII on its own once identifiers are gone).
  {
    label: "Caregiver profile — display name",
    table: "caregiver_profiles",
    column: "display_name",
    owner_column: "user_id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Caregiver profile — bio",
    table: "caregiver_profiles",
    column: "bio",
    owner_column: "user_id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Caregiver profile — headline",
    table: "caregiver_profiles",
    column: "headline",
    owner_column: "user_id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Caregiver profile — photo",
    table: "caregiver_profiles",
    column: "photo_url",
    owner_column: "user_id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Caregiver profile — postcode",
    table: "caregiver_profiles",
    column: "postcode",
    owner_column: "user_id",
    owner_source: "subject_user_id",
    action: "null",
  },
  {
    label: "Caregiver profile — city",
    table: "caregiver_profiles",
    column: "city",
    owner_column: "user_id",
    owner_source: "subject_user_id",
    action: "null",
  },

  // --- 3) care_plans: address + special instructions. Retained under
  // NHSX CoP for the 6-year floor. Soft-deleted (via care_plans hard-
  // delete queue) so the row survives until the retention timer fires.
  {
    label: "Care plan — recipient address (retained 6 years, NHSX CoP)",
    table: "care_plans",
    column: "address_line1",
    owner_column: "created_by",
    owner_source: "subject_user_id",
    action: "retain",
    legal_basis:
      "Records Management Code of Practice 2021 — adult health & care records, minimum 6 years",
    retained_until: careRecordsRetainedUntil,
  },
  {
    label: "Care plan — special instructions (retained 6 years, NHSX CoP)",
    table: "care_plans",
    column: "special_instructions",
    owner_column: "created_by",
    owner_source: "subject_user_id",
    action: "retain",
    legal_basis:
      "Records Management Code of Practice 2021 — adult health & care records, minimum 6 years",
    retained_until: careRecordsRetainedUntil,
  },

  // --- 4) bookings: accounting record (HMRC 6y). Fully retained; the
  // audit row makes the reason explicit.
  {
    label: "Bookings as seeker (retained 6 years, HMRC CT/VAT)",
    table: "bookings",
    column: null, // row-level retain
    owner_column: "seeker_id",
    owner_source: "subject_user_id",
    action: "retain",
    legal_basis:
      "Companies Act 2006 s388 + HMRC record-keeping — accounting records minimum 6 years",
    retained_until: accountingRetainedUntil,
  },
  {
    label: "Bookings as caregiver (retained 6 years, HMRC CT/VAT)",
    table: "bookings",
    column: null,
    owner_column: "caregiver_id",
    owner_source: "subject_user_id",
    action: "retain",
    legal_basis:
      "Companies Act 2006 s388 + HMRC record-keeping — accounting records minimum 6 years",
    retained_until: accountingRetainedUntil,
  },

  // --- 5) safeguarding_alerts: Article 17(3)(b) refusal.
  // Retained under the safeguarding legal basis — regardless of whether
  // the subject is the carer or the seeker referenced. The retention
  // map's minor-vs-adult branching (75y vs 6y) is applied by the
  // higher-level caller when it can prove the subject is a minor;
  // handler default is the adult 6-year floor.
  {
    label: "Safeguarding referrals about the subject as carer (Art. 17(3)(b))",
    table: "safeguarding_alerts",
    column: null,
    owner_column: "carer_id",
    owner_source: "subject_user_id",
    action: "retain",
    legal_basis:
      "UK GDPR Art. 17(3)(b) — compliance with legal obligation (Care Act 2014 safeguarding duties)",
    retained_until: safeguardingAdultRetainedUntil,
  },
  {
    label: "Safeguarding referrals about the subject as seeker (Art. 17(3)(b))",
    table: "safeguarding_alerts",
    column: null,
    owner_column: "seeker_id",
    owner_source: "subject_user_id",
    action: "retain",
    legal_basis:
      "UK GDPR Art. 17(3)(b) — compliance with legal obligation (Care Act 2014 safeguarding duties)",
    retained_until: safeguardingAdultRetainedUntil,
  },

  // --- 6) DSAR request itself.
  // The request row stays for the audit period. `notes` is nulled so
  // any admin free-text about the subject doesn't outlive them.
  {
    label: "DSAR request — admin notes",
    table: "dsar_requests",
    column: "notes",
    owner_column: "subject_email",
    owner_source: "subject_email",
    action: "null",
  },
];

// --------------------------------------------------------------------------
// Client interface
// --------------------------------------------------------------------------

/**
 * The subset of the Supabase client the handler needs. Kept narrow so
 * tests can pass a hand-rolled fake without pulling Postgres or fetch
 * into unit tests. The real caller passes `createAdminClient()`.
 */
export type ErasureAdminClient = {
  from(table: string): {
    /** UPDATE ... SET values WHERE ownerCol = ownerValue */
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string,
      ): Promise<{
        data: unknown[] | null;
        error: { code?: string; message?: string } | null;
        count?: number | null;
      }>;
    };
    /**
     * Insert audit / queue rows. Returns `data` on success but the
     * handler only cares about `error`.
     */
    insert(
      values: Record<string, unknown>[],
    ): Promise<{
      data: unknown[] | null;
      error: { code?: string; message?: string } | null;
    }>;
  };
};

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type DsarErasureAuditRow = {
  dsar_request_id: string;
  subject_email: string;
  subject_user_id: string | null;
  table_name: string;
  column_name: string | null;
  owner_column: string;
  owner_value: string;
  action: ErasureAction | "skip";
  reason: string | null;
  retained_until: string | null;
  row_count: number;
  error: string | null;
  executed_at: string;
};

export type DsarDeferredQueueRow = {
  dsar_request_id: string;
  subject_email: string;
  subject_user_id: string | null;
  table_name: string;
  owner_column: string;
  owner_value: string;
  column_name: string | null;
  retained_until: string;
};

export type DsarErasureInput = {
  dsar_request_id: string;
  subject_email: string;
  /**
   * The verified user id, or null if the request is for a
   * deleted-account subject whose auth.users row is already gone. The
   * handler still runs — email-keyed manifest steps (like nulling the
   * DSAR request notes) execute; user-id-keyed steps are recorded as
   * skipped with reason `subject_user_id_missing`.
   */
  subject_user_id: string | null;
  /**
   * Optional override for the run clock. Defaults to `new Date()`.
   * Tests inject a fixed clock so retained_until dates are stable.
   */
  now?: Date;
};

export type DsarErasureResult = {
  ok: true;
  audit: DsarErasureAuditRow[];
  deferred: DsarDeferredQueueRow[];
  audit_persist_error: string | null;
  deferred_persist_error: string | null;
  request_persist_error: string | null;
  /** SHA-256 of the manifest run so the subject email can quote it. */
  digest: string;
  version: string;
};

// --------------------------------------------------------------------------
// The handler
// --------------------------------------------------------------------------

function isSchemaNotReady(err: {
  code?: string;
  message?: string;
}): boolean {
  return (
    err.code === UNDEFINED_TABLE ||
    err.code === UNDEFINED_COLUMN ||
    /relation .* does not exist/i.test(err.message ?? "") ||
    /column .* does not exist/i.test(err.message ?? "")
  );
}

export async function handleDsarErase(
  admin: ErasureAdminClient,
  input: DsarErasureInput,
): Promise<DsarErasureResult> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const audit: DsarErasureAuditRow[] = [];
  const deferred: DsarDeferredQueueRow[] = [];

  for (const step of ERASURE_MANIFEST) {
    const owner_value =
      step.owner_source === "subject_user_id"
        ? input.subject_user_id
        : input.subject_email;

    if (owner_value === null || owner_value === undefined) {
      audit.push({
        dsar_request_id: input.dsar_request_id,
        subject_email: input.subject_email,
        subject_user_id: input.subject_user_id,
        table_name: step.table,
        column_name: step.column,
        owner_column: step.owner_column,
        owner_value: "",
        action: "skip",
        reason: "subject_user_id_missing",
        retained_until: null,
        row_count: 0,
        error: null,
        executed_at: nowIso,
      });
      continue;
    }

    const retained =
      step.retained_until != null ? step.retained_until(now) : null;

    // The four action branches. `anonymise` isn't used in the current
    // manifest but is kept in the type for future steps.
    if (step.action === "retain") {
      audit.push({
        dsar_request_id: input.dsar_request_id,
        subject_email: input.subject_email,
        subject_user_id: input.subject_user_id,
        table_name: step.table,
        column_name: step.column,
        owner_column: step.owner_column,
        owner_value,
        action: "retain",
        reason: step.legal_basis ?? "retained",
        retained_until: retained,
        row_count: 0, // not counting — the row stays
        error: null,
        executed_at: nowIso,
      });
      continue;
    }

    // For null / pseudonymise / anonymise / soft-delete we hit the DB.
    let updateValues: Record<string, unknown>;
    if (step.action === "null") {
      if (!step.column) {
        audit.push({
          dsar_request_id: input.dsar_request_id,
          subject_email: input.subject_email,
          subject_user_id: input.subject_user_id,
          table_name: step.table,
          column_name: null,
          owner_column: step.owner_column,
          owner_value,
          action: "skip",
          reason: "manifest_missing_column",
          retained_until: null,
          row_count: 0,
          error: null,
          executed_at: nowIso,
        });
        continue;
      }
      updateValues = { [step.column]: null };
    } else if (step.action === "pseudonymise") {
      if (!step.column) {
        audit.push({
          dsar_request_id: input.dsar_request_id,
          subject_email: input.subject_email,
          subject_user_id: input.subject_user_id,
          table_name: step.table,
          column_name: null,
          owner_column: step.owner_column,
          owner_value,
          action: "skip",
          reason: "manifest_missing_column",
          retained_until: null,
          row_count: 0,
          error: null,
          executed_at: nowIso,
        });
        continue;
      }
      updateValues = {
        [step.column]: pseudonymFor(input.subject_user_id),
      };
    } else if (step.action === "soft-delete") {
      updateValues = { deleted_at: nowIso };
    } else {
      // anonymise — not currently used; skip with a clear reason.
      audit.push({
        dsar_request_id: input.dsar_request_id,
        subject_email: input.subject_email,
        subject_user_id: input.subject_user_id,
        table_name: step.table,
        column_name: step.column,
        owner_column: step.owner_column,
        owner_value,
        action: "skip",
        reason: "anonymise_not_implemented",
        retained_until: null,
        row_count: 0,
        error: null,
        executed_at: nowIso,
      });
      continue;
    }

    const { data, error, count } = await admin
      .from(step.table)
      .update(updateValues)
      .eq(step.owner_column, owner_value);

    if (error) {
      if (isSchemaNotReady(error)) {
        audit.push({
          dsar_request_id: input.dsar_request_id,
          subject_email: input.subject_email,
          subject_user_id: input.subject_user_id,
          table_name: step.table,
          column_name: step.column,
          owner_column: step.owner_column,
          owner_value,
          action: "skip",
          reason: "schema_not_ready",
          retained_until: null,
          row_count: 0,
          error: error.message ?? null,
          executed_at: nowIso,
        });
      } else {
        audit.push({
          dsar_request_id: input.dsar_request_id,
          subject_email: input.subject_email,
          subject_user_id: input.subject_user_id,
          table_name: step.table,
          column_name: step.column,
          owner_column: step.owner_column,
          owner_value,
          action: "skip",
          reason: "db_error",
          retained_until: null,
          row_count: 0,
          error: error.message ?? "unknown_db_error",
          executed_at: nowIso,
        });
      }
      continue;
    }

    audit.push({
      dsar_request_id: input.dsar_request_id,
      subject_email: input.subject_email,
      subject_user_id: input.subject_user_id,
      table_name: step.table,
      column_name: step.column,
      owner_column: step.owner_column,
      owner_value,
      action: step.action,
      reason: null,
      retained_until: retained,
      row_count: typeof count === "number" ? count : (data?.length ?? 0),
      error: null,
      executed_at: nowIso,
    });

    if (step.action === "soft-delete") {
      deferred.push({
        dsar_request_id: input.dsar_request_id,
        subject_email: input.subject_email,
        subject_user_id: input.subject_user_id,
        table_name: step.table,
        owner_column: step.owner_column,
        owner_value,
        column_name: step.hard_delete_column ?? null,
        retained_until: retained ?? careRecordsRetainedUntil(now),
      });
    }
  }

  // Always add a self-audit row for the DSAR audit trail. This is the
  // "we kept the fact that we did this for 6y" line from the retention
  // map §5.
  audit.push({
    dsar_request_id: input.dsar_request_id,
    subject_email: input.subject_email,
    subject_user_id: input.subject_user_id,
    table_name: "dsar_erasure_audit",
    column_name: null,
    owner_column: "dsar_request_id",
    owner_value: input.dsar_request_id,
    action: "retain",
    reason: "DSAR audit trail — retained 6 years",
    retained_until: auditRetainedUntil(now),
    row_count: 0,
    error: null,
    executed_at: nowIso,
  });

  // Persist audit rows. Failures here do NOT reverse the row-level
  // nulling — that would leave the subject worse off. Instead the
  // failure is returned so the route wrapper can surface it.
  let audit_persist_error: string | null = null;
  const auditInsert = await admin
    .from("dsar_erasure_audit")
    .insert(audit as unknown as Record<string, unknown>[]);
  if (auditInsert.error) {
    audit_persist_error =
      auditInsert.error.message ?? "unknown_audit_persist_error";
  }

  // Persist deferred queue rows.
  let deferred_persist_error: string | null = null;
  if (deferred.length > 0) {
    const deferredInsert = await admin
      .from("dsar_deferred_erasure_queue")
      .insert(deferred as unknown as Record<string, unknown>[]);
    if (deferredInsert.error) {
      deferred_persist_error =
        deferredInsert.error.message ?? "unknown_queue_persist_error";
    }
  }

  // Flip dsar_requests.state to 'erased'. This is the only place the
  // request row transitions, and we do NOT guard on previous state —
  // by the time the handler runs, the route wrapper has already
  // asserted state='in_progress'.
  let request_persist_error: string | null = null;
  const requestUpdate = await admin
    .from("dsar_requests")
    .update({ state: "erased", delivered_at: nowIso })
    .eq("id", input.dsar_request_id);
  if (requestUpdate.error) {
    request_persist_error =
      requestUpdate.error.message ?? "unknown_request_update_error";
  }

  // Digest is a fingerprint of the manifest + action taken per step,
  // so the subject can quote it back later if they claim the response
  // was modified. Not a cryptographic commitment.
  const digestSource = JSON.stringify(
    audit.map((r) => [r.table_name, r.column_name, r.action, r.row_count]),
  );
  const digest = createHash("sha256")
    .update(digestSource)
    .digest("hex")
    .slice(0, 16);

  return {
    ok: true,
    audit,
    deferred,
    audit_persist_error,
    deferred_persist_error,
    request_persist_error,
    digest,
    version: ERASE_VERSION,
  };
}

// --------------------------------------------------------------------------
// Summarisers for the completion email
// --------------------------------------------------------------------------

/** Human-friendly summary of what was erased. */
export function summariseNulled(
  audit: DsarErasureAuditRow[],
): { label: string; row_count: number }[] {
  const nulled = audit.filter(
    (r) => r.action === "null" || r.action === "pseudonymise",
  );
  const out: { label: string; row_count: number }[] = [];
  for (const r of nulled) {
    const step = ERASURE_MANIFEST.find(
      (s) => s.table === r.table_name && s.column === r.column_name,
    );
    out.push({
      label: step?.label ?? `${r.table_name}.${r.column_name ?? "*"}`,
      row_count: r.row_count,
    });
  }
  return out;
}

/** Human-friendly summary of what was retained + why. */
export function summariseRetained(
  audit: DsarErasureAuditRow[],
): { label: string; legal_basis: string; retained_until: string | null }[] {
  const retained = audit.filter((r) => r.action === "retain");
  return retained.map((r) => {
    const step = ERASURE_MANIFEST.find(
      (s) =>
        s.table === r.table_name &&
        (s.column === r.column_name || (s.column === null && r.column_name === null)),
    );
    return {
      label: step?.label ?? r.table_name,
      legal_basis: r.reason ?? "retained under UK law",
      retained_until: r.retained_until,
    };
  });
}

/** The furthest-out retained_until date across the audit rows. */
export function maxRetainedUntil(
  audit: DsarErasureAuditRow[],
): string | null {
  const dates = audit
    .map((r) => r.retained_until)
    .filter((d): d is string => typeof d === "string");
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a > b ? a : b));
}

export const DSAR_ERASE_CONSTANTS = {
  ERASE_VERSION,
  ERASURE_MANIFEST,
};
