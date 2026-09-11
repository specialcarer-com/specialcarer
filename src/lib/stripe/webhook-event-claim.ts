export type StripeWebhookEventRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

/**
 * Result of the atomic upsert used to claim (or re-claim) a Stripe event.
 *
 * `existing` describes what was on disk BEFORE the current attempt began.
 * `alreadyProcessed` means a prior delivery of this event has already
 * finished successfully — the current attempt must skip effects and
 * acknowledge idempotently. `hasError` means a prior attempt crashed and
 * this delivery is Stripe (or the recovery cron) retrying — effects MUST
 * run again.
 */
export type WebhookEventClaimResult = {
  status: "fresh" | "already_processed" | "retryable";
  attemptCount: number;
  error: string | null;
};

export type WebhookEventPersistResult = {
  existed: boolean;
  alreadyProcessed: boolean;
  hasError: boolean;
  attemptCount: number;
  error: string | null;
};

/**
 * Atomically upsert the event row and classify what to do next.
 *
 * The `persist` callback is expected to:
 *   - Insert-if-missing with (id, type, payload, attempt_count = 1,
 *     last_attempt_at = now()).
 *   - If the row already existed, bump attempt_count and last_attempt_at
 *     without touching payload/type/processed_at/error, and return
 *     `existed = true` along with the row's current `processed_at` and
 *     `error` state.
 *
 * The classification lives here so both the webhook route and the
 * recovery cron reason about "should I run the handler now?" through the
 * same predicate.
 *
 * Outcomes:
 *   - `fresh`             — first time we've seen this event id, run handler.
 *   - `already_processed` — a prior delivery already set processed_at, skip.
 *   - `retryable`         — row exists but processed_at IS NULL. Either a
 *                           prior attempt crashed (error set) or is still
 *                           in-flight in another Vercel invocation. The
 *                           persist callback SHOULD guard against
 *                           concurrent in-flight runs; this classification
 *                           just tells the caller not to short-circuit
 *                           the way it used to.
 */
export async function claimStripeWebhookEvent(
  persist: (event: StripeWebhookEventRow) => Promise<WebhookEventPersistResult>,
  event: StripeWebhookEventRow,
): Promise<WebhookEventClaimResult> {
  const result = await persist(event);
  if (result.error) {
    return {
      status: "fresh",
      attemptCount: result.attemptCount,
      error: result.error,
    };
  }
  if (!result.existed) {
    return {
      status: "fresh",
      attemptCount: result.attemptCount,
      error: null,
    };
  }
  if (result.alreadyProcessed) {
    return {
      status: "already_processed",
      attemptCount: result.attemptCount,
      error: null,
    };
  }
  return {
    status: "retryable",
    attemptCount: result.attemptCount,
    error: null,
  };
}
