/**
 * Pure helpers for the admin DSAR "erase" confirmation UI.
 *
 * Erasure is destructive and irreversible for anything outside the
 * retention buckets — the C1 handler nulls or hard-deletes PII across
 * ~15 tables and queues deferred hard-deletes with retention timers up
 * to 75 years. The admin UI therefore requires a typed confirmation
 * ("ERASE") on top of the ordinary "are you sure" pattern.
 *
 * These helpers are extracted from the button component so they can be
 * unit-tested without a React runtime. The tests enforce the
 * business rules; the component is a thin shell.
 */

/**
 * The exact confirmation string the admin must type. Uppercase and
 * language-independent — this is the same word used in production
 * ops runbooks for irreversible actions elsewhere in the codebase.
 */
export const ERASE_CONFIRMATION = "ERASE";

/**
 * Optional operator notes on the erase action. Free-form audit trail
 * only — NOT sent to the subject (the C1 route emails a fixed
 * disclosure template with legal-basis references).
 */
export const NOTES_MIN = 0;
export const NOTES_MAX = 1000;

/** Preconditions the admin page must check BEFORE offering the button. */
export type ErasePrecondition =
  | "eligible"
  | "wrong_request_type"
  | "not_verified"
  | "wrong_state"
  | "no_account";

export type ErasePreconditionInput = {
  request_type: string;
  state: string;
  verified_at: string | null;
  subject_user_id: string | null;
};

/**
 * Mirrors the guard clauses in
 * `src/app/api/admin/dsar/[id]/erase/route.ts` so the UI can pre-flight
 * before enabling the button. Returning 'eligible' means the route's
 * guards would pass.
 *
 * Note: 'no_account' is a soft flag (not enforced by the route). The
 * C1 handler can still process the manifest against `subject_email`
 * alone, but the completion-email template makes more sense when we
 * know an account was linked. The UI surfaces this as a warning; it
 * does NOT block the action.
 */
export function checkErasePreconditions(
  row: ErasePreconditionInput,
): ErasePrecondition {
  if (row.request_type !== "erasure") return "wrong_request_type";
  if (row.state !== "in_progress") return "wrong_state";
  if (!row.verified_at) return "not_verified";
  if (!row.subject_user_id) return "no_account";
  return "eligible";
}

/**
 * True iff the typed confirmation matches `ERASE_CONFIRMATION`.
 * Trimmed and case-sensitive — the admin has to type ERASE exactly.
 */
export function isConfirmationValid(typed: string): boolean {
  return typed.trim() === ERASE_CONFIRMATION;
}

/**
 * True iff the (optional) operator notes fit the length bounds.
 * Empty is allowed.
 */
export function areNotesValid(notes: string): boolean {
  const trimmed = notes.trim();
  return trimmed.length >= NOTES_MIN && trimmed.length <= NOTES_MAX;
}

/**
 * Combined submit-enabled predicate for the confirmation modal.
 */
export function canSubmitErase(input: {
  typed_confirmation: string;
  notes: string;
  busy: boolean;
}): boolean {
  if (input.busy) return false;
  if (!isConfirmationValid(input.typed_confirmation)) return false;
  if (!areNotesValid(input.notes)) return false;
  return true;
}

/**
 * Parse a completed erase POST response body into a display-ready
 * summary. Any of the persist_error fields being present means the
 * DB write itself hit a partial failure the admin needs to see (the
 * route always returns HTTP 200 in that case — the failure is
 * reported in the body).
 */
export type ErasePostSuccess = {
  ok: true;
  request_id: string;
  state: "erased";
  nulled_count: number;
  retained_count: number;
  deferred_count: number;
  email_sent: boolean;
  email_error: string | null;
  audit_persist_error: string | null;
  deferred_persist_error: string | null;
  request_persist_error: string | null;
  digest: string;
};

export type ErasePostFailure = {
  ok: false;
  error?: string;
  message?: string;
};

export type EraseUiState =
  | { kind: "ok"; summary: string }
  | { kind: "partial"; summary: string; warnings: string[] }
  | { kind: "error"; message: string };

/**
 * Reduce a route response into three UI outcomes: clean success,
 * partial success with warnings the admin must see (email failed,
 * persist errors), or hard error.
 */
export function reduceEraseResponse(
  status: number,
  body: unknown,
): EraseUiState {
  if (!body || typeof body !== "object") {
    return { kind: "error", message: `Unexpected response (HTTP ${status}).` };
  }
  const b = body as Partial<ErasePostSuccess> & Partial<ErasePostFailure>;
  if (!(status >= 200 && status < 300) || b.ok !== true) {
    const msg = b.message ?? b.error ?? `Erase failed (HTTP ${status}).`;
    return { kind: "error", message: msg };
  }
  const success = b as ErasePostSuccess;
  const summary =
    `Nulled ${success.nulled_count}, retained ${success.retained_count}` +
    `, deferred ${success.deferred_count}.`;

  const warnings: string[] = [];
  if (success.email_sent === false) {
    warnings.push(
      `Completion email did not send: ${success.email_error ?? "unknown"}. ` +
        `Notify the subject manually.`,
    );
  }
  if (success.audit_persist_error) {
    warnings.push(`Audit log write reported: ${success.audit_persist_error}`);
  }
  if (success.deferred_persist_error) {
    warnings.push(
      `Deferred queue write reported: ${success.deferred_persist_error}`,
    );
  }
  if (success.request_persist_error) {
    warnings.push(
      `Request state flip reported: ${success.request_persist_error}`,
    );
  }
  return warnings.length === 0
    ? { kind: "ok", summary }
    : { kind: "partial", summary, warnings };
}

export const ERASE_CONFIRMATION_CONSTANTS = {
  ERASE_CONFIRMATION,
  NOTES_MIN,
  NOTES_MAX,
} as const;
