import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STALE_AFTER_MS,
  recoverStripeWebhooks,
  type RecoveryClient,
  type StuckEvent,
} from "./recovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Recovery includes a fresh POST back to the webhook route which itself
// runs the full handler switch. 60s is well within Vercel's function limit
// and comfortably above the wall-clock cost of BATCH_SIZE × handler time.
export const maxDuration = 60;

/**
 * GET /api/cron/stripe-webhook-recovery
 *
 * Sweeps error rows out of `stripe_webhook_events` by replaying the
 * stored payload back through the primary webhook route with a signed
 * x-sc-webhook-replay header. This closes the "handler crashed AND
 * Stripe already saw a 200 from a prior delivery of the same event id"
 * gap that the old idempotency semantics silently introduced.
 *
 * Runs every 15 minutes. Idempotent — the underlying claim helper
 * classifies replayed events as retryable and lets the handler run
 * again, then marks processed_at on success. Bounded to BATCH_SIZE per
 * sweep so we cannot fan a database anomaly into an unbounded incident.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    process.env.SITE_URL?.trim() ??
    // Vercel exposes the deployment URL as a fallback.
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (!cronSecret) {
    // Same posture as the primary webhook: refuse rather than run an
    // insecure replay path.
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (!siteUrl) {
    return NextResponse.json(
      { ok: false, error: "SITE_URL not configured" },
      { status: 500 },
    );
  }

  const replayUrl = new URL("/api/stripe/webhook", siteUrl).toString();

  const client: RecoveryClient = {
    async findStuck({ staleAfterMs, maxAttempts, limit }) {
      const staleBefore = new Date(Date.now() - staleAfterMs).toISOString();
      const { data, error } = await admin
        .from("stripe_webhook_events")
        .select("id, type, payload, attempt_count, created_at, last_attempt_at")
        .is("processed_at", null)
        .not("error", "is", null)
        .lt("last_attempt_at", staleBefore)
        .lt("attempt_count", maxAttempts)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) return { events: [], error: error.message };
      const now = Date.now();
      const events: StuckEvent[] = (data ?? [])
        .filter(
          (row): row is {
            id: string;
            type: string;
            payload: Record<string, unknown>;
            attempt_count: number;
            created_at: string;
            last_attempt_at: string | null;
          } =>
            typeof row.id === "string" &&
            typeof row.type === "string" &&
            !!row.payload &&
            typeof row.payload === "object",
        )
        .map((row) => ({
          id: row.id,
          type: row.type,
          payload: row.payload,
          attemptCount: row.attempt_count ?? 0,
          ageMs: Math.max(0, now - new Date(row.created_at).getTime()),
        }));
      return { events, error: null };
    },

    async replay(event) {
      try {
        const res = await fetch(replayUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-sc-webhook-replay": cronSecret,
          },
          body: JSON.stringify(event.payload),
          // Short guard so a single stuck handler does not consume the
          // cron's whole 60s budget.
          signal: AbortSignal.timeout(20_000),
        });
        let body: {
          received?: boolean;
          idempotent?: boolean;
          poisoned?: boolean;
          error?: string;
        } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          /* non-JSON body — leave as {} */
        }
        return { status: res.status, body };
      } catch (err) {
        return {
          status: 0,
          body: {},
          networkError:
            err instanceof Error ? err.message : "replay_network_error",
        };
      }
    },
  };

  const res = await recoverStripeWebhooks(client, {
    staleAfterMs: DEFAULT_STALE_AFTER_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    batchSize: DEFAULT_BATCH_SIZE,
  });
  if (res.body.ok) {
    console.log(
      `[cron.stripe-webhook-recovery] scanned ${res.body.scanned}, recovered ${res.body.recovered}, still_failing ${res.body.still_failing}, poisoned ${res.body.poisoned}, errors ${res.body.errors}`,
    );
  } else {
    console.error("[cron.stripe-webhook-recovery] failed:", res.body.error);
  }
  return NextResponse.json(res.body, { status: res.status });
}
