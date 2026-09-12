/**
 * Stripe dispute lifecycle webhook handler.
 *
 * Handles the five dispute event types Stripe emits:
 *   - charge.dispute.created            → open case, hold payout
 *   - charge.dispute.updated            → sync amount / evidence deadline / state
 *   - charge.dispute.closed             → move to won / lost / warning_closed
 *   - charge.dispute.funds_withdrawn    → (lost path) write refund_ledger row
 *   - charge.dispute.funds_reinstated   → (won-after-withdrawal) release hold
 *
 * Idempotency
 * ───────────
 * Stripe re-delivers events on any handler crash or 5xx. Two layers of
 * defence, both keyed on Stripe-owned ids so replay is a no-op even
 * across parallel deliveries:
 *
 *   1. `stripe_webhook_events(id)` — the outer PK owned by the router
 *      (PR #202 state machine). Same event id twice → already_processed.
 *   2. `stripe_dispute_cases(stripe_dispute_id)` — the unique index.
 *      Upserts here so the SAME dispute id landing under a different
 *      event id still produces one row.
 *   3. `refund_ledger(stripe_refund_id, event_type)` — inherited from
 *      PR #207. We use `stripe_dispute_id` as the "refund id" for the
 *      `'dispute_lost'` synthetic event_type so duplicate delivery of
 *      `charge.dispute.funds_withdrawn` is a no-op.
 *
 * Deploy-safe
 * ───────────
 * If `stripe_dispute_cases` doesn't exist yet (migration
 * 20260912133500 unapplied), the handler returns
 * `{ok:true, skippedReason:"schema_not_ready"}` and does nothing else.
 * The router treats that as a success and marks `processed_at` — Stripe
 * stops retrying, and once the migration lands future events populate
 * the table fresh. Prior events during the deploy window can be replayed
 * from the Stripe dashboard.
 *
 * Every state transition also writes into `stripe_webhook_events`
 * (via the router's existing bookkeeping) so the operational view of
 * "what did we do to this event" stays symmetric with refunds/PIs.
 */

import type Stripe from "stripe";
import { recordRefundEvent } from "@/lib/payments/refund-ledger";
import {
  clearDisputeOpenHold,
  setDisputeOpenHold,
} from "@/lib/payments/payout-hold";

// ── Types ────────────────────────────────────────────────────────────────────

export type DisputeEventType =
  | "charge.dispute.created"
  | "charge.dispute.updated"
  | "charge.dispute.closed"
  | "charge.dispute.funds_withdrawn"
  | "charge.dispute.funds_reinstated";

/**
 * Internal state values. Kept aligned with the CHECK constraint on
 * `stripe_dispute_cases.state`. Do not add values here without adding
 * them to the CHECK in migration 20260912133500 and to the admin queue
 * filter chips.
 */
export type DisputeCaseState =
  | "opened"
  | "evidence_submitted"
  | "under_review"
  | "won"
  | "lost"
  | "warning_closed";

export type DisputeWebhookResult =
  | {
      ok: true;
      caseId: string | null;
      state: DisputeCaseState;
      /** True iff this delivery inserted a fresh row. */
      inserted: boolean;
      /** True iff this delivery clear/set the payout hold. */
      holdChanged: boolean;
      /** True iff this delivery wrote a refund_ledger row. */
      ledgerWritten: boolean;
    }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: true; skippedReason: "unhandled_event_type"; type: string }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DisputeAdminClient = { from(table: string): any };

// ── Schema-missing detection ────────────────────────────────────────────────

const PG_UNDEFINED_TABLE = "42P01";

function isDisputeSchemaMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  return (
    code === PG_UNDEFINED_TABLE ||
    /relation .*stripe_dispute_cases.* does not exist/i.test(message) ||
    /could not find the table .*stripe_dispute_cases/i.test(message)
  );
}

// ── Stripe → internal-state mapping ──────────────────────────────────────────

/**
 * Map a Stripe dispute.status to our internal state machine.
 * Stripe's statuses (docs):
 *   warning_needs_response, warning_under_review, warning_closed,
 *   needs_response, under_review, won, lost, charge_refunded (rare, legacy)
 *
 * We collapse both "warning_" and "needs_response" into 'opened' because
 * the operational surface is the same (admin needs to upload evidence).
 * 'warning_closed' terminal is preserved — no funds move, no ledger row,
 * no hold change (see acceptance criterion in phase_c_pr_plan.md line 44
 * → duplicate-webhook / warning-closed cases).
 */
function stripeStatusToState(
  status: Stripe.Dispute.Status | string | null | undefined,
): DisputeCaseState {
  switch (status) {
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "warning_closed":
      return "warning_closed";
    case "under_review":
    case "warning_under_review":
      return "under_review";
    case "warning_needs_response":
    case "needs_response":
    default:
      return "opened";
  }
}

const TERMINAL_STATES: readonly DisputeCaseState[] = [
  "won",
  "lost",
  "warning_closed",
];

// ── booking_id resolution from charge_id ─────────────────────────────────────

/**
 * Resolve the internal booking_id for a Stripe charge id by walking
 * payments.stripe_charge_id first, then falling back to the charge's
 * payment_intent → payments.stripe_payment_intent_id.
 *
 * Returns null if we can't attribute the dispute — the case row is
 * still inserted so ops can see it in the admin queue.
 */
async function resolveBookingId(
  admin: DisputeAdminClient,
  dispute: Stripe.Dispute,
): Promise<string | null> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (chargeId) {
    const { data } = await admin
      .from("payments")
      .select("booking_id")
      .eq("stripe_charge_id", chargeId)
      .maybeSingle();
    if (data?.booking_id) return data.booking_id as string;
  }
  const pi = dispute.payment_intent;
  const pid = typeof pi === "string" ? pi : pi?.id ?? null;
  if (pid) {
    const { data } = await admin
      .from("payments")
      .select("booking_id")
      .eq("stripe_payment_intent_id", pid)
      .maybeSingle();
    if (data?.booking_id) return data.booking_id as string;
  }
  return null;
}

// ── Upsert case row ─────────────────────────────────────────────────────────

type UpsertCaseInput = {
  booking_id: string | null;
  stripe_charge_id: string | null;
  stripe_dispute_id: string;
  state: DisputeCaseState;
  reason: string | null;
  amount_cents: number | null;
  currency: string | null;
  evidence_due_at: string | null;
  resolved_at: string | null;
  notes?: string | null;
};

async function upsertCase(
  admin: DisputeAdminClient,
  input: UpsertCaseInput,
): Promise<
  | { ok: true; id: string; inserted: boolean; priorState: DisputeCaseState | null }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: string }
> {
  // Read existing first — we need priorState for the caller to decide
  // whether to change the hold. A single UPSERT would work for
  // idempotency but loses the "did this transition happen or is it a
  // replay" distinction the caller needs.
  const { data: existing, error: readErr } = await admin
    .from("stripe_dispute_cases")
    .select("id, state")
    .eq("stripe_dispute_id", input.stripe_dispute_id)
    .maybeSingle();
  if (readErr) {
    if (isDisputeSchemaMissing(readErr)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: (readErr as { message?: string }).message ?? "case read failed",
    };
  }

  if (existing) {
    // Row exists. If the state is already terminal (won/lost/
    // warning_closed) we do NOT downgrade it to 'under_review' or
    // 'opened' on a stray later delivery — terminal is terminal.
    const priorState = (existing as { state: DisputeCaseState }).state;
    const priorIsTerminal = TERMINAL_STATES.includes(priorState);
    const nextIsTerminal = TERMINAL_STATES.includes(input.state);
    // Only update state if we're going forward or hitting a terminal.
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (!priorIsTerminal || (nextIsTerminal && input.state === priorState)) {
      patch.state = input.state;
    }
    // Always refresh the mutable Stripe-owned fields.
    if (input.reason !== null) patch.reason = input.reason;
    if (input.amount_cents !== null) patch.amount_cents = input.amount_cents;
    if (input.currency !== null) patch.currency = input.currency;
    if (input.evidence_due_at !== null)
      patch.evidence_due_at = input.evidence_due_at;
    if (input.resolved_at !== null) patch.resolved_at = input.resolved_at;
    if (input.stripe_charge_id !== null)
      patch.stripe_charge_id = input.stripe_charge_id;

    const { error: updErr } = await admin
      .from("stripe_dispute_cases")
      .update(patch)
      .eq("id", (existing as { id: string }).id);
    if (updErr) {
      return {
        ok: false,
        error: (updErr as { message?: string }).message ?? "case update failed",
      };
    }
    return {
      ok: true,
      id: (existing as { id: string }).id,
      inserted: false,
      priorState,
    };
  }

  // Fresh insert. Use upsert with onConflict as a race-safe guard against
  // two parallel deliveries of the same dispute id (both would have seen
  // no existing row above and raced to insert).
  const { data: inserted, error: insErr } = await admin
    .from("stripe_dispute_cases")
    .upsert(
      {
        booking_id: input.booking_id,
        stripe_charge_id: input.stripe_charge_id,
        stripe_dispute_id: input.stripe_dispute_id,
        state: input.state,
        reason: input.reason,
        amount_cents: input.amount_cents,
        currency: input.currency,
        evidence_due_at: input.evidence_due_at,
        resolved_at: input.resolved_at,
        notes: input.notes ?? null,
      },
      { onConflict: "stripe_dispute_id", ignoreDuplicates: false },
    )
    .select("id")
    .maybeSingle();
  if (insErr) {
    if (isDisputeSchemaMissing(insErr)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: (insErr as { message?: string }).message ?? "case insert failed",
    };
  }
  return {
    ok: true,
    id: (inserted as { id: string } | null)?.id ?? "",
    inserted: true,
    priorState: null,
  };
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Handle a Stripe dispute event. Called from
 * `src/app/api/stripe/webhook/route.ts` for the five event types listed
 * in {@link DisputeEventType}. Returns a small structured result the
 * router logs and — on error — surfaces to Stripe as a 500 so Stripe
 * retries. Non-dispute events return `unhandled_event_type` and are a
 * hard no-op.
 */
export async function handleDisputeEvent(
  admin: DisputeAdminClient,
  event: Stripe.Event,
): Promise<DisputeWebhookResult> {
  // Guard: the router should have filtered these, but be defensive.
  const type = event.type as DisputeEventType | string;
  if (
    type !== "charge.dispute.created" &&
    type !== "charge.dispute.updated" &&
    type !== "charge.dispute.closed" &&
    type !== "charge.dispute.funds_withdrawn" &&
    type !== "charge.dispute.funds_reinstated"
  ) {
    return { ok: true, skippedReason: "unhandled_event_type", type };
  }

  const dispute = event.data.object as Stripe.Dispute;
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id ?? null;
  const evidenceDueUnix = dispute.evidence_details?.due_by ?? null;
  const evidenceDueAt = evidenceDueUnix
    ? new Date(evidenceDueUnix * 1000).toISOString()
    : null;
  const state = stripeStatusToState(dispute.status);
  const isTerminal = TERMINAL_STATES.includes(state);
  const resolvedAt = isTerminal ? new Date().toISOString() : null;
  const bookingId = await resolveBookingId(admin, dispute);

  const upsert = await upsertCase(admin, {
    booking_id: bookingId,
    stripe_charge_id: chargeId,
    stripe_dispute_id: dispute.id,
    state,
    reason: dispute.reason ?? null,
    amount_cents: typeof dispute.amount === "number" ? dispute.amount : null,
    currency: dispute.currency ?? null,
    evidence_due_at: evidenceDueAt,
    resolved_at: resolvedAt,
  });
  if (!upsert.ok) {
    return { ok: false, error: upsert.error };
  }
  if ("skippedReason" in upsert) {
    return { ok: true, skippedReason: "schema_not_ready" };
  }

  // ── Payout hold & ledger side-effects ─────────────────────────────────────
  //
  // These are guarded by state transitions so replay of the SAME event
  // doesn't double-fire. `priorState` is null on insert, so an insert
  // with state='opened' fires the hold; an update from 'opened' →
  // 'opened' does not.
  const priorState = upsert.priorState; // null when inserted, else previous state
  let holdChanged = false;
  let ledgerWritten = false;

  if (bookingId) {
    // → 'opened': set hold. Only fires on the first sight of this dispute.
    if (state === "opened" && priorState === null) {
      const holdRes = await setDisputeOpenHold(admin, bookingId);
      holdChanged = "changed" in holdRes && holdRes.changed === true;
    }

    // → 'won': clear hold if still ours.
    if (state === "won" && priorState !== "won") {
      const holdRes = await clearDisputeOpenHold(admin, bookingId);
      holdChanged = "changed" in holdRes && holdRes.changed === true;
    }

    // funds_withdrawn OR terminal 'lost': write a refund_ledger row.
    // Both events land for the same dispute (withdrawal first, then
    // closed with status='lost'). The ledger is keyed on
    // (stripe_dispute_id, event_type='dispute_lost') so both deliveries
    // collapse to one row via the unique index.
    //
    // We DO NOT clear the hold on 'lost' — money moved out via Stripe
    // and the hold's job is done; leaving it in place is an audit
    // signal to admin. (Payout worker will still skip.)
    if (
      (type === "charge.dispute.funds_withdrawn" ||
        (type === "charge.dispute.closed" && state === "lost")) &&
      typeof dispute.amount === "number"
    ) {
      const ledgerRes = await recordRefundEvent(admin, {
        booking_id: bookingId,
        // Use dispute id as the refund id key — the ledger's unique
        // index is (stripe_refund_id, event_type), so this makes
        // "dispute_lost for dp_xxx" a single row across both event
        // deliveries. The dispute id namespace (dp_xxx) does not
        // collide with real refund ids (re_xxx).
        stripe_refund_id: dispute.id,
        stripe_event_id: event.id,
        // Extend event_type union at the call site — the ledger table
        // accepts any text, only the Type union is narrower. See
        // note in refund-ledger.ts about widening if we want
        // exhaustiveness on the projector.
        event_type: "dispute_lost" as unknown as
          | "charge.refunded"
          | "charge.refund.updated"
          | "refund.failed",
        amount_cents: -Math.abs(dispute.amount),
        currency: dispute.currency ?? "gbp",
        status: "succeeded",
        reason: dispute.reason ?? "dispute_lost",
        raw: dispute as unknown as Record<string, unknown>,
      });
      ledgerWritten = "inserted" in ledgerRes && ledgerRes.inserted === true;
    }

    // funds_reinstated (won after prior withdrawal). Release the hold
    // if still ours. No ledger entry — the reinstatement will show as
    // a positive refund_ledger row via Stripe's refund flow, or as an
    // out-of-band credit. Out of scope for C1.
    if (type === "charge.dispute.funds_reinstated") {
      const holdRes = await clearDisputeOpenHold(admin, bookingId);
      holdChanged =
        holdChanged || ("changed" in holdRes && holdRes.changed === true);
    }
  }

  return {
    ok: true,
    caseId: upsert.id || null,
    state,
    inserted: upsert.inserted,
    holdChanged,
    ledgerWritten,
  };
}

/**
 * Mark a dispute case as `evidence_submitted`. Called from the admin UI
 * when the operator has uploaded evidence via the Stripe dashboard.
 * Only allowed from an 'opened' or 'under_review' state; terminal
 * states reject with `already_terminal`.
 *
 * The route calling this MUST enforce admin auth — this function is
 * DB-only, not auth-aware.
 */
export async function markEvidenceSubmitted(
  admin: DisputeAdminClient,
  caseId: string,
): Promise<
  | { ok: true; changed: boolean }
  | { ok: false; error: string; reason?: "not_found" | "already_terminal" }
> {
  const { data: row, error: readErr } = await admin
    .from("stripe_dispute_cases")
    .select("id, state")
    .eq("id", caseId)
    .maybeSingle();
  if (readErr) {
    return {
      ok: false,
      error: (readErr as { message?: string }).message ?? "read failed",
    };
  }
  if (!row) return { ok: false, error: "case not found", reason: "not_found" };
  const current = (row as { state: DisputeCaseState }).state;
  if (TERMINAL_STATES.includes(current)) {
    return {
      ok: false,
      error: `cannot mark evidence_submitted from terminal state '${current}'`,
      reason: "already_terminal",
    };
  }
  if (current === "evidence_submitted") {
    return { ok: true, changed: false };
  }
  const { error: updErr } = await admin
    .from("stripe_dispute_cases")
    .update({ state: "evidence_submitted", updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .in("state", ["opened", "under_review"]); // race guard
  if (updErr) {
    return {
      ok: false,
      error: (updErr as { message?: string }).message ?? "update failed",
    };
  }
  return { ok: true, changed: true };
}
