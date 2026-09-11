/**
 * Pure handler for admin DSAR rejection.
 *
 * Splitting update + email + audit-log out of the route handler keeps it
 * testable with a fake Supabase client. The route wrapper composes this
 * with `requireAdminApi()`, `logAdminAction()`, and `sendEmail()`.
 */

const NON_TERMINAL_STATES = new Set([
  "submitted",
  "verifying",
  "in_progress",
]);

const REASON_MIN_LENGTH = 10;
const REASON_MAX_LENGTH = 2000;

export type DsarRejectRow = {
  id: string;
  subject_email: string;
  request_type: string;
  state: string;
  notes: string | null;
};

export type DsarRejectClient = {
  fetchById(id: string): Promise<{
    data: DsarRejectRow | null;
    error: { code?: string; message?: string } | null;
  }>;
  markRejected(input: {
    id: string;
    reason: string;
    admin_email: string;
    previous_state: string;
  }): Promise<{
    data: DsarRejectRow | null;
    error: { code?: string; message?: string } | null;
  }>;
};

export type DsarRejectInput = {
  request_id: string;
  reason: string;
  admin_email: string;
};

export type DsarRejectResult =
  | {
      ok: true;
      row: DsarRejectRow;
      /**
       * The previous state before we flipped to `rejected`. Useful for
       * audit logging so the entry records the transition.
       */
      previous_state: string;
    }
  | {
      ok: false;
      status: 400 | 404 | 409 | 500;
      code:
        | "invalid_reason"
        | "not_found"
        | "already_terminal"
        | "concurrent_update"
        | "schema_not_ready"
        | "db_error";
      message: string;
    };

export async function handleDsarReject(args: {
  input: DsarRejectInput;
  client: DsarRejectClient;
}): Promise<DsarRejectResult> {
  const reason = (args.input.reason ?? "").trim();
  if (reason.length < REASON_MIN_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: "invalid_reason",
      message: `Reason must be at least ${REASON_MIN_LENGTH} characters.`,
    };
  }
  if (reason.length > REASON_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      code: "invalid_reason",
      message: `Reason must be at most ${REASON_MAX_LENGTH} characters.`,
    };
  }

  const fetched = await args.client.fetchById(args.input.request_id);
  if (fetched.error) {
    if (
      fetched.error.code === "42P01" ||
      /relation .* does not exist/i.test(fetched.error.message ?? "")
    ) {
      return {
        ok: false,
        status: 409,
        code: "schema_not_ready",
        message: "DSAR schema not yet applied.",
      };
    }
    return {
      ok: false,
      status: 500,
      code: "db_error",
      message: fetched.error.message ?? "Database error",
    };
  }
  if (!fetched.data) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "Request not found.",
    };
  }
  if (!NON_TERMINAL_STATES.has(fetched.data.state)) {
    return {
      ok: false,
      status: 409,
      code: "already_terminal",
      message: `Request is already ${fetched.data.state}.`,
    };
  }

  const previousState = fetched.data.state;
  const updated = await args.client.markRejected({
    id: args.input.request_id,
    reason,
    admin_email: args.input.admin_email,
    previous_state: previousState,
  });
  if (updated.error) {
    return {
      ok: false,
      status: 500,
      code: "db_error",
      message: updated.error.message ?? "Update failed.",
    };
  }
  if (!updated.data) {
    // The state guard on the UPDATE (WHERE state = previous_state) missed —
    // another admin (or the cron) transitioned the row between our read and
    // our write. Report as a concurrent update; the caller can re-fetch.
    return {
      ok: false,
      status: 409,
      code: "concurrent_update",
      message: "Request state changed while we were rejecting it.",
    };
  }

  return { ok: true, row: updated.data, previous_state: previousState };
}

export const DSAR_REJECT_CONSTANTS = {
  REASON_MIN_LENGTH,
  REASON_MAX_LENGTH,
  NON_TERMINAL_STATES: Array.from(NON_TERMINAL_STATES),
};
