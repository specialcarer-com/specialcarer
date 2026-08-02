/**
 * Logging + metrics for rejected B2B lead-form submissions. Pairs with
 * src/lib/anti-spam/validate-lead.ts (which only does pure validation).
 *
 * Every rejection (honeypot hit, random-string field, free-webmail block,
 * invalid UK phone, rate limit) is written to `spam_lead_attempts` for
 * ongoing visibility — see supabase/migrations/20260802220811_spam_lead_attempts.sql.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface SpamAttemptInput {
  sourceForm: string;
  rejectionReason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Best-effort insert — a logging failure must never block or fail the
 * caller's HTTP response, so all errors are swallowed after a console.error.
 */
export async function logSpamAttempt(input: SpamAttemptInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("spam_lead_attempts").insert({
      source_form: input.sourceForm,
      rejection_reason: input.rejectionReason,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      payload_json: input.payload ?? null,
    });
    if (error) {
      console.error("[anti-spam] failed to log spam attempt", error);
    }
  } catch (e) {
    console.error("[anti-spam] logSpamAttempt threw", e);
  }
}

/**
 * Tiny in-memory honeypot-hit counter, namespaced per form. Not durable
 * across cold starts/regions — good enough to eyeball bot volume via logs
 * (see `honeypotHitCount`) without adding an external metrics dependency
 * for a 1-3/day spam volume. Mirrors the in-memory rate-limit primitive
 * at src/lib/rate-limit.ts.
 */
const HONEYPOT_HITS = new Map<string, number>();

export function recordHoneypotHit(sourceForm: string): number {
  const next = (HONEYPOT_HITS.get(sourceForm) ?? 0) + 1;
  HONEYPOT_HITS.set(sourceForm, next);
  console.warn(
    `[anti-spam] honeypot hit on "${sourceForm}" (this-instance total: ${next})`,
  );
  return next;
}

export function getHoneypotHitCount(sourceForm: string): number {
  return HONEYPOT_HITS.get(sourceForm) ?? 0;
}
