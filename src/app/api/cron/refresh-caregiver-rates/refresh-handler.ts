/**
 * Pure handler for the refresh-caregiver-rates cron.
 *
 * The recompute itself lives in the SECURITY DEFINER RPC
 * refresh_caregiver_rates() (see
 * supabase/migrations/20260611120000_caregiver_rates_v1.sql). This module holds the
 * parts worth unit-testing without a live DB:
 *
 *   - authorize(): the Vercel cron secret check (mirrors expire-match-offers).
 *   - handleRefresh(): orchestration over a narrow client surface (a stub in
 *     tests, the real RPC call in route.ts), including the row count + duration
 *     reporting the brief asks for.
 */

/**
 * Standard Vercel cron auth: the platform sends `Authorization: Bearer
 * <CRON_SECRET>`. Mirrors the other cron routes — if CRON_SECRET is unset we
 * allow the call (local/dev); otherwise the bearer token must match exactly.
 */
export function authorize(
  authHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return true;
  return authHeader === `Bearer ${secret}`;
}

export type RefreshResult =
  | { status: number; body: { ok: true; updated: number; duration_ms: number } }
  | { status: number; body: { ok: false; error: string } };

/** Narrow client surface; tests pass a stub, route.ts wraps the real RPC. */
export type RefreshClient = {
  /** Runs refresh_caregiver_rates(); returns rows upserted or an error. */
  refreshRates: () => Promise<{ updated: number; error: string | null }>;
  /** Injectable clock for deterministic duration assertions. */
  now?: () => number;
};

export async function handleRefresh(
  client: RefreshClient,
): Promise<RefreshResult> {
  const clock = client.now ?? (() => Date.now());
  const startedAt = clock();
  const { updated, error } = await client.refreshRates();
  const duration_ms = Math.max(0, clock() - startedAt);

  if (error) {
    return { status: 500, body: { ok: false, error } };
  }
  return { status: 200, body: { ok: true, updated, duration_ms } };
}
