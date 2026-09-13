/**
 * SpecialCarer — self-service account-deletion eligibility check
 * (Phase C — PR C5).
 *
 * Runs before we accept a deletion submission, and again on token
 * verification (blockers can change during the 24-hour verify window
 * — a booking may be scheduled, a dispute may open).
 *
 * Design
 * ──────
 * Every blocker check is deps-injectable so tests can drive them
 * one at a time without the whole PostgREST surface area. The default
 * bundle wires each check to a Supabase admin client.
 *
 * Deploy safety
 * ─────────────
 * Each blocker check catches Postgres 42P01 (relation does not exist)
 * and 42703 (column does not exist) and returns an empty result rather
 * than throwing. This is deliberate: PR #218 (disputes) and PR #221
 * (payout alerts) land at slightly different times across environments,
 * and the deletion route must not 500 just because one adjacent schema
 * hasn't caught up. A missing table = "we can't check this today, but
 * that's better than blocking everyone".
 *
 * Blocker vocabulary (kept short and user-safe — every message is
 * shown verbatim on the danger-zone page):
 *   active_booking            — bookings.status in
 *                               (pending, accepted, paid, in_progress)
 *   active_dispute            — stripe_dispute_cases.state in
 *                               (opened, evidence_submitted, under_review)
 *   open_notifiable_event     — notifiable_events.reported_by = uid
 *                               AND state != 'closed'
 *   outstanding_payout        — payout_alerts.carer_id = uid
 *                               AND state = 'new'
 *
 * Discovery notes (spot-checks against migrations):
 *   * bookings uses `status` (enum booking_status), not `state`.
 *     Active-shift-relevant enum values: pending, accepted, paid,
 *     in_progress. `completed`, `paid_out`, `cancelled`, `refunded`,
 *     `disputed` are terminal or resolved.
 *   * stripe_dispute_cases.state (PR #218) uses opened /
 *     evidence_submitted / under_review / won / lost / warning_closed.
 *     "Not yet resolved" = NOT IN (won, lost, warning_closed).
 *   * payouts live in booking_payouts (status column) AND
 *     payout_alerts (state column). PR #221's carer-visible alert is
 *     payout_alerts with state='new' — that's the surface a user would
 *     recognise as "your payout hasn't landed yet". This check keys off
 *     that table.
 *   * notifiable_events has reported_by (not reporter_id).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EligibilityAdminClient = { from(table: string): any };

export type Blocker = {
  /** Machine code — stable, matches account_deletion_jobs.blocker_codes. */
  code: BlockerCode;
  /** Plain-English sentence shown to the user verbatim. */
  message: string;
  /** Optional deep-link target (e.g. the booking id) for the UI to render. */
  resource_id?: string;
};

export type BlockerCode =
  | "active_booking"
  | "active_dispute"
  | "open_notifiable_event"
  | "outstanding_payout";

export type EligibilityResult = {
  eligible: boolean;
  blockers: Blocker[];
};

/**
 * Bookings.status values that count as "not yet finished" for the
 * purpose of blocking deletion. Matches the enum defined in
 * supabase/migrations/20260502161123_stripe_connect_schema.sql.
 */
const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "accepted",
  "paid",
  "in_progress",
] as const;

/**
 * stripe_dispute_cases.state values that count as still-open. Anything
 * not on this list is either terminal or a state we choose not to
 * block on.
 */
const OPEN_DISPUTE_STATES = [
  "opened",
  "evidence_submitted",
  "under_review",
] as const;

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";

function isSchemaNotReady(err: {
  code?: string;
  message?: string;
} | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === UNDEFINED_TABLE ||
    err.code === UNDEFINED_COLUMN ||
    /relation .* does not exist/i.test(err.message ?? "") ||
    /column .* does not exist/i.test(err.message ?? "")
  );
}

// ── Individual blocker checks ─────────────────────────────────────────────
//
// Each check returns Blocker[] (empty if the user is clear). Errors that
// look like a missing table/column collapse to an empty list — see the
// deploy-safety note in the file header.

export type BlockerCheck = (
  user_id: string,
  db: EligibilityAdminClient,
) => Promise<Blocker[]>;

/** bookings.status ∈ active enum where user is seeker or carer. */
export const checkActiveBooking: BlockerCheck = async (user_id, db) => {
  const { data, error } = await db
    .from("bookings")
    .select("id, status, starts_at, seeker_id, caregiver_id")
    .or(`seeker_id.eq.${user_id},caregiver_id.eq.${user_id}`)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
  if (error) {
    if (isSchemaNotReady(error)) return [];
    // A real DB error is treated as "cannot check" — degrade to
    // permissive rather than block a user who isn't actually blocked.
    // The cron worker's second pass will catch anything we missed.
    return [];
  }
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return [];
  const noun = rows.length === 1 ? "booking" : "bookings";
  return [
    {
      code: "active_booking",
      message: `You have ${rows.length} active or upcoming ${noun}. Cancel or complete ${rows.length === 1 ? "it" : "them"} first, then try again.`,
      resource_id: rows[0].id,
    },
  ];
};

/**
 * stripe_dispute_cases.state pre-resolution, joined to bookings so we
 * key off the seeker_id (the human whose card was charged). PostgREST
 * inner-join through the FK.
 */
export const checkActiveDispute: BlockerCheck = async (user_id, db) => {
  const { data, error } = await db
    .from("stripe_dispute_cases")
    .select("id, state, booking:bookings!inner(id, seeker_id)")
    .in("state", OPEN_DISPUTE_STATES as unknown as string[])
    .eq("booking.seeker_id", user_id);
  if (error) {
    if (isSchemaNotReady(error)) return [];
    return [];
  }
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return [];
  return [
    {
      code: "active_dispute",
      message:
        "Your payment dispute is still open. It must be resolved before we can delete your account. We will email you when it closes — usually within 60 days.",
      resource_id: rows[0].id,
    },
  ];
};

/**
 * notifiable_events reported by this user and not yet closed. If the
 * user is the *subject* of an event (carer_id / subject_person_id) we
 * do not block — the retention-manifest already handles that under
 * Article 17(3)(b). We only block the *reporter* because their input
 * is needed to close the case.
 */
export const checkOpenNotifiableEvent: BlockerCheck = async (user_id, db) => {
  const { data, error } = await db
    .from("notifiable_events")
    .select("id, state")
    .eq("reported_by", user_id)
    .neq("state", "closed");
  if (error) {
    if (isSchemaNotReady(error)) return [];
    return [];
  }
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return [];
  const noun = rows.length === 1 ? "safeguarding report" : "safeguarding reports";
  return [
    {
      code: "open_notifiable_event",
      message: `You filed ${rows.length} ${noun} that ${rows.length === 1 ? "is" : "are"} still open. Our safeguarding team will contact you when ${rows.length === 1 ? "it is" : "they are"} closed; you can delete your account after that.`,
      resource_id: rows[0].id,
    },
  ];
};

/**
 * payout_alerts.state='new' for this carer. PR #221's carer-facing
 * alerts land here; a `new` row means the carer hasn't yet been
 * notified or acknowledged the pending payout hold — deleting the
 * account would strand the funds.
 */
export const checkOutstandingPayout: BlockerCheck = async (user_id, db) => {
  const { data, error } = await db
    .from("payout_alerts")
    .select("id, alert_type, state")
    .eq("carer_id", user_id)
    .eq("state", "new");
  if (error) {
    if (isSchemaNotReady(error)) return [];
    return [];
  }
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return [];
  const noun = rows.length === 1 ? "payout alert" : "payout alerts";
  return [
    {
      code: "outstanding_payout",
      message: `You have ${rows.length} unresolved ${noun}. Our payments team will reach out shortly; please resolve ${rows.length === 1 ? "it" : "them"} before requesting deletion so we can send you any money you're owed.`,
      resource_id: rows[0].id,
    },
  ];
};

// ── Public entry point ────────────────────────────────────────────────────

export type EligibilityDeps = {
  db: EligibilityAdminClient;
  /** Injectable checks — defaults to the four above. */
  checkActiveBooking?: BlockerCheck;
  checkActiveDispute?: BlockerCheck;
  checkOpenNotifiableEvent?: BlockerCheck;
  checkOutstandingPayout?: BlockerCheck;
};

/**
 * Run every blocker check in parallel and merge the results. Order in
 * the returned array is stable: booking → dispute → notifiable event
 * → payout. That order also drives which blocked_* state the caller
 * writes to account_deletion_jobs (the first hit).
 */
export async function checkEligibility(
  user_id: string,
  deps: EligibilityDeps,
): Promise<EligibilityResult> {
  const checks: BlockerCheck[] = [
    deps.checkActiveBooking ?? checkActiveBooking,
    deps.checkActiveDispute ?? checkActiveDispute,
    deps.checkOpenNotifiableEvent ?? checkOpenNotifiableEvent,
    deps.checkOutstandingPayout ?? checkOutstandingPayout,
  ];
  const results = await Promise.all(checks.map((c) => c(user_id, deps.db)));
  const blockers = results.flat();
  return { eligible: blockers.length === 0, blockers };
}

/**
 * Map the first blocker's code to the corresponding
 * account_deletion_jobs.state value. `blocked_other` is the fallback
 * for unknown codes (shouldn't happen — the type union prevents it —
 * but the sentinel keeps the DB check-constraint happy).
 */
export function blockedStateFromBlockers(
  blockers: Blocker[],
): "blocked_active_booking"
  | "blocked_active_dispute"
  | "blocked_open_notifiable_event"
  | "blocked_outstanding_payout"
  | "blocked_other" {
  const primary = blockers[0]?.code;
  switch (primary) {
    case "active_booking":
      return "blocked_active_booking";
    case "active_dispute":
      return "blocked_active_dispute";
    case "open_notifiable_event":
      return "blocked_open_notifiable_event";
    case "outstanding_payout":
      return "blocked_outstanding_payout";
    default:
      return "blocked_other";
  }
}
