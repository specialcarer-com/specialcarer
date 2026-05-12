/**
 * Server-only entry point for one-shot Stripe milestone alerts.
 *
 * Wires the real `sendEmail` from `@/lib/email/smtp` into the pure
 * orchestrator in `./milestone-alert-core.ts`. The core file is kept
 * separate so unit tests can run under plain `node --test` without
 * tripping the `server-only` import.
 *
 * Webhook callers should import from here. Tests should import from
 * `./milestone-alert-core`.
 */
import "server-only";

import type Stripe from "stripe";
import { sendEmail } from "@/lib/email/smtp";
import {
  alertOnFirstLivePaymentSucceeded as alertCore,
  type MilestoneDeps,
} from "./milestone-alert-core";

export {
  MILESTONE_FIRST_LIVE_PI_SUCCEEDED,
  ALERT_RECIPIENTS,
  claimMilestone,
  buildAlertEmail,
} from "./milestone-alert-core";
export type { MilestoneDeps } from "./milestone-alert-core";

/**
 * Production wrapper — defaults the `send` dep to the real SMTP transport.
 * Callers that want to override (almost only tests) should call
 * `alertOnFirstLivePaymentSucceeded` from `./milestone-alert-core` directly.
 */
export async function alertOnFirstLivePaymentSucceeded(
  event: Stripe.Event,
  deps: MilestoneDeps,
): Promise<boolean> {
  return alertCore(event, { ...deps, send: deps.send ?? sendEmail });
}
