/**
 * Stripe payout lifecycle webhook handler — alerting side.
 *
 * The main webhook router (src/app/api/stripe/webhook/route.ts) already
 * flips `payout_intents.status` on `payout.paid` and `payout.failed`
 * for the ops-facing accounting projection. This module layers the
 * CARER-facing alerting surface on top:
 *
 *   - `payout.failed`   → open a payout_alerts row (alert_type='failed',
 *                         state='new'), send in-app notification to the
 *                         affected carer, email the carer, email admin.
 *   - `payout.canceled` → same shape as failed, but with a notes value
 *                         so ops can distinguish Stripe-side cancels
 *                         from real transport failures.
 *   - `payout.paid`     → find any open payout_alerts row for this
 *                         stripe_payout_id and mark it resolved. No
 *                         notification — the router's existing
 *                         payout.completed dispatch handles the
 *                         happy-path notification.
 *
 * Idempotency
 * ───────────
 * Two layers of defence:
 *   1. `stripe_webhook_events(id)` — the router's outer PK guarantees
 *      the same event id twice → already_processed short-circuit.
 *   2. `payout_alerts(stripe_payout_id, alert_type)` — partial unique
 *      index (WHERE stripe_payout_id IS NOT NULL). If a duplicate
 *      `payout.failed` still reaches us (e.g. a fresh event id from
 *      Stripe's retry after our 5xx), the insert hits 23505 and we
 *      skip the notification side-effects — the row and the alert
 *      the carer already saw are enough.
 *
 * Deploy-safe
 * ───────────
 * If `payout_alerts` doesn't exist yet (migration 20260912154500
 * unapplied), the handler returns `{ok:true, skippedReason:
 * "schema_not_ready"}` and does nothing else. The router treats that
 * as success and marks `processed_at` — Stripe stops retrying, and
 * once the migration lands future events populate the table fresh.
 *
 * Notifications never break the webhook. Every notification /
 * email side-effect is wrapped in a try/catch that logs and swallows
 * — a failed email must not cause Stripe to retry the webhook (which
 * would then re-fire the notification for the second delivery).
 */

import type Stripe from "stripe";
import type { NotificationInsert } from "@/lib/notifications/server";
import type { SendEmailInput, SendEmailResult } from "@/lib/email/smtp";

// ── Types ────────────────────────────────────────────────────────────────────

export type PayoutAlertEventType =
  | "payout.failed"
  | "payout.paid"
  | "payout.canceled";

export type PayoutAlertType =
  | "failed"
  | "delayed"
  | "held_dispute"
  | "held_dbs"
  | "held_other";

export type PayoutAlertState =
  | "new"
  | "notified"
  | "acknowledged"
  | "resolved";

export type PayoutWebhookResult =
  | {
      ok: true;
      /** Alert row id (fresh insert or existing on duplicate). null on paid-noop. */
      alertId: string | null;
      /** True iff this delivery inserted a fresh alert row. */
      inserted: boolean;
      /** True iff this delivery moved a prior alert to state='resolved'. */
      resolved: boolean;
      /** True iff in-app + email notifications were dispatched. */
      notified: boolean;
    }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: true; skippedReason: "unhandled_event_type"; type: string }
  | { ok: true; skippedReason: "no_carer_resolved"; payoutId: string | null }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PayoutAdminClient = { from(table: string): any };

// ── Injected deps (test-friendly) ────────────────────────────────────────────

export type PayoutWebhookDeps = {
  /** In-app notification (bell inbox + push fan-out). */
  dispatchNotification?: (input: NotificationInsert) => Promise<unknown>;
  /** Transactional email send. */
  sendEmail?: (input: SendEmailInput) => Promise<SendEmailResult>;
  /** Look up a carer's email by profile id. Returns null if not found. */
  lookupCarerEmail?: (
    admin: PayoutAdminClient,
    carerId: string,
  ) => Promise<string | null>;
  /** Admin recipient for the mirror email. */
  adminEmail?: string | null;
};

const PG_UNDEFINED_TABLE = "42P01";
const PG_UNIQUE_VIOLATION = "23505";

function isAlertsSchemaMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  return (
    code === PG_UNDEFINED_TABLE ||
    /relation .*payout_alerts.* does not exist/i.test(message) ||
    /could not find the table .*payout_alerts/i.test(message)
  );
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  return code === PG_UNIQUE_VIOLATION || /duplicate key value/i.test(message);
}

// ── carer resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the internal profiles.id for a Stripe Connect account id.
 *
 * `payout_intents` may also carry the mapping (a payout aggregates
 * multiple booking earnings and gets a carer_id when created). Try
 * `payout_intents.stripe_payout_id` first — it's the freshest link
 * and doesn't require a Connect account lookup. Fall back to
 * `caregiver_stripe_accounts.stripe_account_id → user_id`.
 */
async function resolveCarerId(
  admin: PayoutAdminClient,
  payout: Stripe.Payout,
): Promise<string | null> {
  // 1. Direct lookup on payout_intents.
  const { data: pi } = await admin
    .from("payout_intents")
    .select("carer_id")
    .eq("stripe_payout_id", payout.id)
    .maybeSingle();
  if (pi?.carer_id) return pi.carer_id as string;

  // 2. Fall back to Connect account → carer. Stripe attaches the
  // destination account id on the event top level, but the Payout
  // object itself doesn't carry it as a public field. The event's
  // `account` property (webhook-level) tells us which Connect account
  // the payout belongs to; the caller can pass it via `_stripeAccount`.
  const acctId = (payout as unknown as { destination?: string | null })
    .destination;
  if (typeof acctId === "string" && acctId.length > 0) {
    const { data: acct } = await admin
      .from("caregiver_stripe_accounts")
      .select("user_id")
      .eq("stripe_account_id", acctId)
      .maybeSingle();
    if (acct?.user_id) return acct.user_id as string;
  }

  return null;
}

// ── Insert / resolve helpers ─────────────────────────────────────────────────

type InsertAlertInput = {
  carer_id: string;
  booking_id: string | null;
  alert_type: PayoutAlertType;
  stripe_payout_id: string | null;
  amount_cents: number | null;
  currency: string;
  notes: string | null;
};

type InsertAlertResult =
  | { ok: true; id: string; inserted: true }
  | { ok: true; id: string | null; inserted: false; duplicate: true }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: string };

async function insertAlert(
  admin: PayoutAdminClient,
  input: InsertAlertInput,
): Promise<InsertAlertResult> {
  const { data: inserted, error: insErr } = await admin
    .from("payout_alerts")
    .insert({
      carer_id: input.carer_id,
      booking_id: input.booking_id,
      alert_type: input.alert_type,
      stripe_payout_id: input.stripe_payout_id,
      amount_cents: input.amount_cents,
      currency: input.currency,
      state: "new",
      notes: input.notes,
    })
    .select("id")
    .maybeSingle();

  if (!insErr && inserted) {
    return { ok: true, id: (inserted as { id: string }).id, inserted: true };
  }

  if (insErr && isAlertsSchemaMissing(insErr)) {
    return { ok: true, skippedReason: "schema_not_ready" };
  }

  if (insErr && isUniqueViolation(insErr)) {
    // Duplicate: fetch the existing row's id so callers can still
    // annotate ops logs, but skip notification side-effects.
    if (input.stripe_payout_id) {
      const { data: existing } = await admin
        .from("payout_alerts")
        .select("id")
        .eq("stripe_payout_id", input.stripe_payout_id)
        .eq("alert_type", input.alert_type)
        .maybeSingle();
      return {
        ok: true,
        id: (existing as { id: string } | null)?.id ?? null,
        inserted: false,
        duplicate: true,
      };
    }
    return { ok: true, id: null, inserted: false, duplicate: true };
  }

  if (insErr) {
    return {
      ok: false,
      error: (insErr as { message?: string }).message ?? "alert insert failed",
    };
  }
  // insErr is falsy but no row returned — treat as OK, no id.
  return { ok: true, id: null, inserted: false, duplicate: true };
}

async function resolveOpenAlertForPayout(
  admin: PayoutAdminClient,
  stripePayoutId: string,
): Promise<
  | { ok: true; resolvedCount: number }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: string }
> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("payout_alerts")
    .update({ state: "resolved", resolved_at: nowIso })
    .eq("stripe_payout_id", stripePayoutId)
    .in("state", ["new", "notified", "acknowledged"])
    .select("id");
  if (error) {
    if (isAlertsSchemaMissing(error)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return {
      ok: false,
      error: (error as { message?: string }).message ?? "resolve failed",
    };
  }
  return {
    ok: true,
    resolvedCount: Array.isArray(data) ? data.length : 0,
  };
}

// ── Notification / email helpers ─────────────────────────────────────────────

function formatMoney(pence: number | null, currency: string): string {
  if (pence == null) return "your latest payout";
  const up = currency.toUpperCase();
  const symbol =
    up === "GBP" ? "£" : up === "USD" ? "$" : up === "EUR" ? "€" : `${up} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

function buildFailedCarerEmail(args: {
  amount: string;
  reason: string | null;
  payoutId: string;
}): { subject: string; html: string; text: string } {
  const reasonLine = args.reason
    ? `<p>Stripe reported the reason as: <strong>${escapeHtml(args.reason)}</strong>.</p>`
    : "";
  const reasonText = args.reason ? `\nReason: ${args.reason}\n` : "\n";
  return {
    subject: `SpecialCarer: your ${args.amount} payout couldn't be sent`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171E54;">
        <h2 style="color:#171E54;">Your payout couldn't be sent</h2>
        <p>Your ${escapeHtml(args.amount)} payout to your bank was not accepted.</p>
        ${reasonLine}
        <p>Please check your bank details in your earnings page. We'll retry automatically on the next payout run once they're updated.</p>
        <p><a href="https://www.specialcarer.com/m/earnings" style="color:#039EA0;">Open earnings</a></p>
        <p style="font-size:11px;color:#575757;">Stripe payout id: ${escapeHtml(args.payoutId)}</p>
      </div>
    `,
    text: `Your ${args.amount} payout couldn't be sent.${reasonText}Please check your bank details at https://www.specialcarer.com/m/earnings — we'll retry automatically once they're updated.\n\nStripe payout id: ${args.payoutId}\n`,
  };
}

function buildAdminEmail(args: {
  alertType: PayoutAlertType;
  carerId: string;
  amount: string;
  reason: string | null;
  payoutId: string;
  notes: string | null;
}): { subject: string; html: string; text: string } {
  const reasonText = args.reason ? `\nStripe reason: ${args.reason}` : "";
  const notesText = args.notes ? `\nNotes: ${args.notes}` : "";
  return {
    subject: `[payout ${args.alertType}] ${args.amount} · carer ${args.carerId.slice(0, 8)}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <h2>Payout ${escapeHtml(args.alertType)}</h2>
        <ul>
          <li><strong>Carer:</strong> ${escapeHtml(args.carerId)}</li>
          <li><strong>Amount:</strong> ${escapeHtml(args.amount)}</li>
          <li><strong>Stripe payout id:</strong> ${escapeHtml(args.payoutId)}</li>
          ${args.reason ? `<li><strong>Reason:</strong> ${escapeHtml(args.reason)}</li>` : ""}
          ${args.notes ? `<li><strong>Notes:</strong> ${escapeHtml(args.notes)}</li>` : ""}
        </ul>
        <p>Open the <a href="https://www.specialcarer.com/admin/finance/payouts">admin payouts queue</a> to triage.</p>
      </div>
    `,
    text: `Payout ${args.alertType}\nCarer: ${args.carerId}\nAmount: ${args.amount}\nStripe payout id: ${args.payoutId}${reasonText}${notesText}\n\nAdmin: https://www.specialcarer.com/admin/finance/payouts\n`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadDefaultDeps(): Promise<Required<PayoutWebhookDeps>> {
  const [{ createNotification }, { sendEmail }] = await Promise.all([
    import("@/lib/notifications/server"),
    import("@/lib/email/smtp"),
  ]);
  return {
    dispatchNotification: createNotification,
    sendEmail,
    lookupCarerEmail: async (admin, carerId) => {
      const { data } = await admin
        .from("profiles")
        .select("email")
        .eq("id", carerId)
        .maybeSingle();
      return (data as { email: string | null } | null)?.email ?? null;
    },
    adminEmail:
      process.env.PAYOUT_ALERT_ADMIN_EMAIL ??
      process.env.OPS_ALERT_EMAIL ??
      process.env.SOS_ADMIN_EMAIL ??
      null,
  };
}

/**
 * Fire the carer in-app + carer email + admin email for a fresh
 * `failed` / `canceled` alert. Never throws — every side-effect is
 * caught so a mail-transport hiccup can't cause Stripe to retry.
 * Returns true iff at least the in-app notification was sent.
 */
async function fireNotifications(args: {
  deps: Required<PayoutWebhookDeps>;
  admin: PayoutAdminClient;
  carerId: string;
  alertType: PayoutAlertType;
  amountCents: number | null;
  currency: string;
  stripePayoutId: string;
  reason: string | null;
  notes: string | null;
}): Promise<boolean> {
  const { deps } = args;
  const amountStr = formatMoney(args.amountCents, args.currency);

  let notified = false;
  try {
    await deps.dispatchNotification({
      user_id: args.carerId,
      type: `payout.${args.alertType}`,
      title:
        args.alertType === "failed"
          ? "Payout couldn't be sent"
          : args.alertType === "delayed"
            ? "Payout delayed"
            : "Payout on hold",
      body:
        args.alertType === "failed"
          ? `Your ${amountStr} payout wasn't accepted by your bank. Please check your details.`
          : args.alertType === "delayed"
            ? `Your ${amountStr} payout is running late. We're on it.`
            : `Your ${amountStr} payout is on hold pending review.`,
      deeplink: "/m/earnings",
      payload: {
        stripe_payout_id: args.stripePayoutId,
        alert_type: args.alertType,
      },
    });
    notified = true;
  } catch (e) {
    console.error("[payout-webhook] in-app notification failed", e);
  }

  try {
    const carerEmail = await deps.lookupCarerEmail(args.admin, args.carerId);
    if (carerEmail) {
      const built = buildFailedCarerEmail({
        amount: amountStr,
        reason: args.reason,
        payoutId: args.stripePayoutId,
      });
      await deps.sendEmail({ to: carerEmail, ...built });
    }
  } catch (e) {
    console.error("[payout-webhook] carer email failed", e);
  }

  try {
    if (deps.adminEmail) {
      const built = buildAdminEmail({
        alertType: args.alertType,
        carerId: args.carerId,
        amount: amountStr,
        reason: args.reason,
        payoutId: args.stripePayoutId,
        notes: args.notes,
      });
      await deps.sendEmail({ to: deps.adminEmail, ...built });
    }
  } catch (e) {
    console.error("[payout-webhook] admin email failed", e);
  }

  return notified;
}

async function markAlertNotified(
  admin: PayoutAdminClient,
  alertId: string,
): Promise<void> {
  try {
    await admin
      .from("payout_alerts")
      .update({ state: "notified" })
      .eq("id", alertId)
      .eq("state", "new");
  } catch (e) {
    console.error("[payout-webhook] state → notified failed", e);
  }
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Handle a Stripe payout event's alerting side-effects. Called from
 * the main Stripe webhook router alongside the existing
 * `payout_intents` status update. Returns a small structured result
 * the router logs and — on error — surfaces to Stripe as a 500 so
 * Stripe retries. Non-payout events return `unhandled_event_type`
 * and are a hard no-op.
 */
export async function handlePayoutAlertEvent(
  admin: PayoutAdminClient,
  event: Stripe.Event,
  deps?: PayoutWebhookDeps,
): Promise<PayoutWebhookResult> {
  const type = event.type as PayoutAlertEventType | string;
  if (
    type !== "payout.failed" &&
    type !== "payout.paid" &&
    type !== "payout.canceled"
  ) {
    return { ok: true, skippedReason: "unhandled_event_type", type };
  }

  const payout = event.data.object as Stripe.Payout;
  // If the caller supplied a FULL deps bundle, don't touch the default
  // loader — that keeps tests free of the `server-only` transitive
  // pull-in from `@/lib/email/smtp`. If they only supplied a partial
  // bundle we merge over the defaults (partial override).
  const isCompleteOverride =
    deps !== undefined &&
    typeof deps.dispatchNotification === "function" &&
    typeof deps.sendEmail === "function" &&
    typeof deps.lookupCarerEmail === "function";
  const resolved: Required<PayoutWebhookDeps> = isCompleteOverride
    ? {
        dispatchNotification: deps!.dispatchNotification!,
        sendEmail: deps!.sendEmail!,
        lookupCarerEmail: deps!.lookupCarerEmail!,
        adminEmail: deps!.adminEmail ?? null,
      }
    : { ...(await loadDefaultDeps()), ...(deps ?? {}) };

  // ── payout.paid: resolve open alerts, no notification ─────────────────────
  if (type === "payout.paid") {
    const res = await resolveOpenAlertForPayout(admin, payout.id);
    if (!res.ok) return { ok: false, error: res.error };
    if ("skippedReason" in res) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return {
      ok: true,
      alertId: null,
      inserted: false,
      resolved: res.resolvedCount > 0,
      notified: false,
    };
  }

  // ── payout.failed / payout.canceled: open a fresh alert row ───────────────
  const carerId = await resolveCarerId(admin, payout);
  if (!carerId) {
    // Can't attribute this payout — log and skip. The router will
    // still mark processed_at via its own bookkeeping.
    console.warn(
      "[payout-webhook] no carer resolved for payout",
      payout.id,
      "type",
      type,
    );
    return { ok: true, skippedReason: "no_carer_resolved", payoutId: payout.id };
  }

  const isCanceled = type === "payout.canceled";
  const insert = await insertAlert(admin, {
    carer_id: carerId,
    booking_id: null,
    alert_type: "failed", // spec: canceled uses alert_type='failed' with notes
    stripe_payout_id: payout.id,
    amount_cents: typeof payout.amount === "number" ? payout.amount : null,
    currency: (payout.currency ?? "gbp").toLowerCase(),
    notes: isCanceled ? "canceled by Stripe" : null,
  });
  if (!insert.ok) return { ok: false, error: insert.error };
  if ("skippedReason" in insert) {
    return { ok: true, skippedReason: "schema_not_ready" };
  }

  // Duplicate delivery: row already exists, notification already fired.
  if (!insert.inserted) {
    return {
      ok: true,
      alertId: insert.id,
      inserted: false,
      resolved: false,
      notified: false,
    };
  }

  // Fresh row → fire notifications.
  const notified = await fireNotifications({
    deps: resolved,
    admin,
    carerId,
    alertType: "failed",
    amountCents: typeof payout.amount === "number" ? payout.amount : null,
    currency: (payout.currency ?? "gbp").toLowerCase(),
    stripePayoutId: payout.id,
    reason: payout.failure_message ?? null,
    notes: isCanceled ? "canceled by Stripe" : null,
  });
  if (notified && insert.id) {
    await markAlertNotified(admin, insert.id);
  }

  return {
    ok: true,
    alertId: insert.id,
    inserted: true,
    resolved: false,
    notified,
  };
}
