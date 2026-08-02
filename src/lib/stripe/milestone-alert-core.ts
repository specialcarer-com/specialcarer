/**
 * Pure orchestration for one-shot Stripe milestone alerts.
 *
 * This file deliberately does NOT import "server-only" — it stays
 * test-runnable from plain Node (`node --test`). The `server-only`
 * wrapper that the webhook handler imports lives in `./milestone-alert.ts`
 * and simply re-exports from here.
 *
 * All dependencies are injected (admin client, send function, logger) so
 * the test can stub them without spinning up Supabase or SMTP.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { SendEmailInput, SendEmailResult } from "@/lib/email/smtp";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

/** Singleton key in `platform_milestones`. */
export const MILESTONE_FIRST_LIVE_PI_SUCCEEDED = "first_live_payment_succeeded";

/** Where the alert is delivered. */
export const ALERT_RECIPIENTS = [
  "steve@allcare4u.co.uk",
  "bot@specialcarer.com",
] as const;

export type MilestoneDeps = {
  admin: AnySupabase;
  /**
   * Email sender. Defaults to the SMTP-wired sendEmail in the wrapper.
   * Test overrides to a stub. Note: the wrapper file injects the real
   * default; this core file leaves it required-undefinedable so we never
   * accidentally call into `@/lib/email/smtp` from a Node test runtime
   * where it would pull in `server-only`.
   */
  send?: (input: SendEmailInput) => Promise<SendEmailResult>;
  logger?: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

function fmtMoney(amountCents: number, currency: string): string {
  const cur = currency.toUpperCase();
  const sym = cur === "USD" ? "$" : cur === "GBP" ? "£" : `${cur} `;
  return `${sym}${(amountCents / 100).toFixed(2)}`;
}

export function buildAlertEmail(pi: Stripe.PaymentIntent): SendEmailInput {
  const customerId =
    typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
  const amount = fmtMoney(pi.amount_received ?? pi.amount, pi.currency ?? "gbp");
  const link = `https://dashboard.stripe.com/payments/${pi.id}`;

  const subject = "SpecialCarer: First live Stripe payment processed";
  const text = [
    "The first livemode payment_intent.succeeded event has been processed.",
    "",
    `PaymentIntent: ${pi.id}`,
    `Amount:        ${amount}`,
    `Currency:      ${(pi.currency ?? "").toUpperCase()}`,
    customerId ? `Customer:      ${customerId}` : null,
    `Created:       ${new Date(pi.created * 1000).toISOString()}`,
    "",
    `Stripe dashboard: ${link}`,
    "",
    "If this email is unexpected, audit the Stripe webhook routing immediately —",
    "either a test event leaked into the live secret slot, or a live event landed",
    "without the expected guard.",
    "",
    "— SpecialCarer (automated milestone alert, fires once per platform lifetime)",
  ]
    .filter((s): s is string => s !== null)
    .join("\n");

  const html = `
    <div style="font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2F2E31;">
      <p style="margin:0 0 4px;font-size:13px;color:#0E7C7B;font-weight:700;letter-spacing:0.04em;">MILESTONE</p>
      <h1 style="margin:0 0 16px;font-size:22px;color:#171E54;">First live Stripe payment processed</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#575757;">
        The first livemode <code>payment_intent.succeeded</code> event has cleared the webhook handler end-to-end.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;font-size:13px;color:#575757;width:130px;">PaymentIntent</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;font-family:monospace;">${pi.id}</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#575757;">Amount</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${amount}</td></tr>
        <tr><td style="padding:6px 0;font-size:13px;color:#575757;">Currency</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${(pi.currency ?? "").toUpperCase()}</td></tr>
        ${customerId ? `<tr><td style="padding:6px 0;font-size:13px;color:#575757;">Customer</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;font-family:monospace;">${customerId}</td></tr>` : ""}
        <tr><td style="padding:6px 0;font-size:13px;color:#575757;">Created</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${new Date(pi.created * 1000).toISOString()}</td></tr>
      </table>
      <p style="margin:24px 0 0;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#0E7C7B;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">Open in Stripe dashboard</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#A3A3A3;">
        Automated milestone alert — fires once per platform lifetime. If unexpected, audit the Stripe webhook routing immediately.
      </p>
    </div>
  `;

  return { to: "", subject, html, text };
}

/**
 * Atomically claim the milestone via existence-check + insert.
 * Returns `true` when this caller actually inserted the row.
 * Returns `false` on race-lost (PK conflict) or when the row already
 * existed.
 */
export async function claimMilestone(
  admin: AnySupabase,
  key: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const { data: existing } = await admin
    .from("platform_milestones")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (existing) return false;

  const { error } = await admin
    .from("platform_milestones")
    .insert({ key, payload });
  if (error) return false;
  return true;
}

/**
 * One-shot alert orchestrator.
 *
 * Contract:
 *   - Never throws. All failures swallow + log; the webhook still returns 200.
 *   - Returns true iff this call actually sent at least one email.
 */
export async function alertOnFirstLivePaymentSucceeded(
  event: Stripe.Event,
  deps: MilestoneDeps,
): Promise<boolean> {
  const logger = deps.logger ?? {
    info: (...args) => console.info(...args),
    error: (...args) => console.error(...args),
  };
  try {
    if (event.livemode !== true) return false;
    if (event.type !== "payment_intent.succeeded") return false;

    const pi = event.data.object as Stripe.PaymentIntent;

    let claimed = false;
    try {
      claimed = await claimMilestone(
        deps.admin,
        MILESTONE_FIRST_LIVE_PI_SUCCEEDED,
        {
          payment_intent_id: pi.id,
          amount: pi.amount_received ?? pi.amount,
          currency: pi.currency,
          customer:
            typeof pi.customer === "string"
              ? pi.customer
              : pi.customer?.id ?? null,
          stripe_event_id: event.id,
          observed_at: new Date().toISOString(),
        },
      );
    } catch (e) {
      logger.error("[milestone] claim failed", e);
      return false;
    }
    if (!claimed) return false;

    logger.info(
      `[milestone] first_live_payment_succeeded pi=${pi.id} amount=${
        pi.amount_received ?? pi.amount
      }`,
    );

    if (!deps.send) {
      // No transport injected — wrapper file is responsible for wiring
      // sendEmail. We log and return false rather than silently dropping.
      logger.error("[milestone] no send function provided");
      return false;
    }

    const base = buildAlertEmail(pi);
    let anySent = false;
    for (const to of ALERT_RECIPIENTS) {
      try {
        const result = await deps.send({ ...base, to });
        if (result.ok) {
          anySent = true;
        } else {
          logger.error("[milestone] alert send failed", to, result.error);
        }
      } catch (e) {
        logger.error("[milestone] alert send threw", to, e);
      }
    }
    return anySent;
  } catch (e) {
    logger.error("[milestone] unexpected failure", e);
    return false;
  }
}
