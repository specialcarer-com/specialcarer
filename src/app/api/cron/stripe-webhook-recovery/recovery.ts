/**
 * Pure decision logic for the Stripe webhook recovery cron.
 *
 * The cron reads unprocessed error rows from `stripe_webhook_events`, sorts
 * them oldest-first, and replays each stored payload back through the
 * webhook route (via a signed x-sc-webhook-replay HTTP call). This module
 * decides which rows to select, how to age-bucket outcomes, and how to
 * classify a replay response.
 *
 * All I/O lives in the route wrapper (route.ts). This module is
 * exhaustively unit-tested against a stub client so every branch is
 * covered without hitting Supabase, Stripe, or the network.
 */

/** How long a claim must have been unprocessed before the cron considers
 * it eligible for replay. Gives Stripe's own retry storm room to heal
 * transient issues without our interference. */
export const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

/** Give up entirely after this many total handler attempts, matching the
 * webhook route's MAX_HANDLER_ATTEMPTS ceiling. */
export const DEFAULT_MAX_ATTEMPTS = 8;

/** Max rows per sweep. Bounded so a database anomaly cannot fan a single
 * sweep into an unbounded replay incident. */
export const DEFAULT_BATCH_SIZE = 50;

export type StuckEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  ageMs: number;
};

export type ReplayOutcome =
  | { kind: "recovered"; eventId: string; type: string }
  | { kind: "still_failing"; eventId: string; type: string; reason: string }
  | { kind: "poisoned"; eventId: string; type: string }
  | { kind: "error"; eventId: string; error: string };

export type RecoveryClient = {
  findStuck: (input: {
    staleAfterMs: number;
    maxAttempts: number;
    limit: number;
  }) => Promise<{ events: StuckEvent[]; error: string | null }>;
  replay: (event: StuckEvent) => Promise<{
    status: number;
    body: { received?: boolean; idempotent?: boolean; poisoned?: boolean; error?: string };
    networkError?: string;
  }>;
};

export type RecoverySummary = {
  ok: true;
  scanned: number;
  recovered: number;
  still_failing: number;
  poisoned: number;
  errors: number;
  outcomes: ReplayOutcome[];
};

export type RecoveryError = { ok: false; error: string };

export type RecoveryOptions = {
  staleAfterMs?: number;
  maxAttempts?: number;
  batchSize?: number;
};

export async function recoverStripeWebhooks(
  client: RecoveryClient,
  opts: RecoveryOptions = {},
): Promise<{ status: number; body: RecoverySummary | RecoveryError }> {
  const staleAfterMs = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const limit = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const found = await client.findStuck({ staleAfterMs, maxAttempts, limit });
  if (found.error) {
    return { status: 500, body: { ok: false, error: found.error } };
  }

  const outcomes: ReplayOutcome[] = [];
  for (const event of found.events) {
    outcomes.push(await classifyReplay(client, event));
  }

  const summary: RecoverySummary = {
    ok: true,
    scanned: found.events.length,
    recovered: outcomes.filter((o) => o.kind === "recovered").length,
    still_failing: outcomes.filter((o) => o.kind === "still_failing").length,
    poisoned: outcomes.filter((o) => o.kind === "poisoned").length,
    errors: outcomes.filter((o) => o.kind === "error").length,
    outcomes,
  };
  return { status: 200, body: summary };
}

/**
 * Classify a single replay attempt.
 *
 *  200 { received: true }                    → recovered
 *  200 { received: true, poisoned: true }    → poisoned (retry ceiling hit)
 *  200 { received: true, idempotent: true }  → recovered (someone else got
 *                                              there first; effect is
 *                                              already applied — no reason
 *                                              to keep it in the queue)
 *  500 { error }                             → still_failing
 *  network error                             → error (surface + bail row)
 */
export async function classifyReplay(
  client: RecoveryClient,
  event: StuckEvent,
): Promise<ReplayOutcome> {
  const res = await client.replay(event);
  if (res.networkError) {
    return { kind: "error", eventId: event.id, error: res.networkError };
  }
  if (res.status === 200) {
    if (res.body.poisoned) {
      return { kind: "poisoned", eventId: event.id, type: event.type };
    }
    return { kind: "recovered", eventId: event.id, type: event.type };
  }
  const reason = res.body.error ?? `http_${res.status}`;
  return { kind: "still_failing", eventId: event.id, type: event.type, reason };
}
