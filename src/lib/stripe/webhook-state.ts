/**
 * E1 — Stripe webhook state-machine helpers.
 *
 * PR #188 introduced atomic claiming on `stripe_webhook_events`; the row
 * state was implicit in `(processed_at, error)`. E1 adds an explicit
 * `state` enum column so the ambiguous `(processed_at NOT NULL, error
 * NOT NULL)` case can no longer wedge a delivery.
 *
 * States, per migration 20260914114600_refund_reconciliation_and_webhook_state:
 *
 *   pending    → row just claimed, handler has not started
 *   processing → handler is running in this invocation
 *   completed  → handler exited cleanly, ack Stripe
 *   failed     → handler threw OR was found stuck in 'processing'
 *
 * All three writes are wrapped in the codebase's deploy-safe schema
 * fallback: PG 42P01 (undefined_table) and 42703 (undefined_column) →
 * `{ok:true, skippedReason:'schema_not_ready'}` so the webhook handler
 * continues to work in the window between deploy and migration apply
 * (mirrors the recordRefundEvent pattern in src/lib/payments/refund-ledger.ts).
 *
 * The webhook route calls these helpers ALONGSIDE the existing
 * processed_at/error writes — the state column complements the legacy
 * columns; nothing existing is removed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WebhookStateAdminClient = { from(table: string): any };

export type WebhookStateResult =
  | { ok: true; updated: boolean }
  | { ok: true; updated: false; skippedReason: "schema_not_ready" }
  | { ok: false; error: string };

/** Postgres error codes handled as "schema not applied yet" (deploy-safe). */
const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

function isSchemaNotReady(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) return true;
  const msg = (err as { message?: string } | null)?.message ?? "";
  return (
    /stripe_webhook_events.*does not exist/i.test(msg) ||
    /column .*state.* does not exist/i.test(msg)
  );
}

/**
 * Transition an existing webhook event row into `processing`. Called
 * immediately AFTER the claim upsert succeeds and BEFORE the handler
 * switch runs.
 *
 * Idempotent: PATCH by id only; if the row is already in `processing`
 * from a concurrent invocation this is a harmless no-op write.
 */
export async function markWebhookEventProcessing(
  admin: WebhookStateAdminClient,
  eventId: string,
): Promise<WebhookStateResult> {
  try {
    const { error } = await admin
      .from("stripe_webhook_events")
      .update({ state: "processing" })
      .eq("id", eventId);
    if (error) {
      if (isSchemaNotReady(error)) {
        return { ok: true, updated: false, skippedReason: "schema_not_ready" };
      }
      return { ok: false, error: error.message ?? "state=processing failed" };
    }
    return { ok: true, updated: true };
  } catch (err) {
    if (isSchemaNotReady(err)) {
      return { ok: true, updated: false, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Mark the row completed alongside `processed_at`. */
export async function markWebhookEventCompleted(
  admin: WebhookStateAdminClient,
  eventId: string,
): Promise<WebhookStateResult> {
  try {
    const { error } = await admin
      .from("stripe_webhook_events")
      .update({ state: "completed" })
      .eq("id", eventId);
    if (error) {
      if (isSchemaNotReady(error)) {
        return { ok: true, updated: false, skippedReason: "schema_not_ready" };
      }
      return { ok: false, error: error.message ?? "state=completed failed" };
    }
    return { ok: true, updated: true };
  } catch (err) {
    if (isSchemaNotReady(err)) {
      return { ok: true, updated: false, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Mark the row failed alongside `error`. */
export async function markWebhookEventFailed(
  admin: WebhookStateAdminClient,
  eventId: string,
): Promise<WebhookStateResult> {
  try {
    const { error } = await admin
      .from("stripe_webhook_events")
      .update({ state: "failed" })
      .eq("id", eventId);
    if (error) {
      if (isSchemaNotReady(error)) {
        return { ok: true, updated: false, skippedReason: "schema_not_ready" };
      }
      return { ok: false, error: error.message ?? "state=failed failed" };
    }
    return { ok: true, updated: true };
  } catch (err) {
    if (isSchemaNotReady(err)) {
      return { ok: true, updated: false, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Release rows stuck in `processing` for longer than STUCK_THRESHOLD_MS.
 * Called at the TOP of every webhook invocation, before any handler
 * dispatch, so a crashed prior invocation's row is available for retry.
 *
 * Cheap: a single UPDATE, no preceding SELECT. Bounds are enforced by
 * `last_attempt_at`, which the claim path always sets.
 *
 * Uses `coalesce(error, 'stuck_in_processing')` so any prior error string
 * from a crashed handler survives.
 */
export const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function sweepStuckProcessingRows(
  admin: WebhookStateAdminClient,
  opts: { thresholdMs?: number; now?: () => Date } = {},
): Promise<WebhookStateResult> {
  const thresholdMs = opts.thresholdMs ?? STUCK_THRESHOLD_MS;
  const now = opts.now ? opts.now() : new Date();
  const cutoff = new Date(now.getTime() - thresholdMs).toISOString();
  try {
    // Supabase-js can't express COALESCE(error, ...) in a single UPDATE
    // without an RPC; a two-step (select-then-update) is what the D3
    // notifiable_events sweeper does. Keep the same shape: only touch
    // rows that are still `processing` and stale.
    const { data, error } = await admin
      .from("stripe_webhook_events")
      .select("id, error")
      .eq("state", "processing")
      .lt("last_attempt_at", cutoff)
      .limit(500);
    if (error) {
      if (isSchemaNotReady(error)) {
        return { ok: true, updated: false, skippedReason: "schema_not_ready" };
      }
      return { ok: false, error: error.message ?? "sweep select failed" };
    }
    const rows = (data ?? []) as Array<{ id: string; error: string | null }>;
    if (rows.length === 0) return { ok: true, updated: false };
    // Fan out — small batches (≤500) are fine, only stuck rows appear.
    for (const r of rows) {
      const { error: updErr } = await admin
        .from("stripe_webhook_events")
        .update({
          state: "failed",
          error: r.error ?? "stuck_in_processing",
        })
        .eq("id", r.id)
        .eq("state", "processing");
      if (updErr) {
        if (isSchemaNotReady(updErr)) {
          return {
            ok: true,
            updated: false,
            skippedReason: "schema_not_ready",
          };
        }
        return {
          ok: false,
          error: updErr.message ?? "sweep update failed",
        };
      }
    }
    return { ok: true, updated: true };
  } catch (err) {
    if (isSchemaNotReady(err)) {
      return { ok: true, updated: false, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
