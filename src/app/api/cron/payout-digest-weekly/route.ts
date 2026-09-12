/**
 * Weekly payout monitoring digest.
 *
 * Runs every Monday at 08:00 UTC. For each carer with any
 * `payout_alerts` row created in the past 7 days, sends a single
 * digest email summarising:
 *   - paid payouts (count) — from resolved alerts
 *   - held payouts (with reason from bookings.carer_payout_hold_reason)
 *   - failed alerts (still in state new/notified/acknowledged)
 *
 * No email is sent for carers with zero alerts in the window
 * (per acceptance criterion 2).
 *
 * Auth
 * ────
 * Uses the standard cron auth pattern — `Authorization: Bearer
 * ${CRON_SECRET}` via `requireCronAuth`. Vercel Cron attaches this
 * automatically; manual/local invocations must set the same header.
 *
 * Deploy-safe
 * ───────────
 * If the `payout_alerts` table is missing (PG 42P01) or the
 * `bookings.carer_payout_hold_reason` column is missing (PG 42703),
 * returns `{ok:true, skipped:true, reason:"schema_not_ready"}` with
 * 200 so Vercel doesn't retry on a schedule where the schema hasn't
 * caught up yet. Mirrors the pattern in
 * `src/app/api/cron/release-payouts/fetch-due-bookings.ts` and
 * `src/lib/stripe/payout-webhook.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PG_UNDEFINED_TABLE = "42P01";
const PG_UNDEFINED_COLUMN = "42703";

function isSchemaNotReady(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) return true;
  return (
    /relation .*payout_alerts.* does not exist/i.test(message) ||
    /could not find the table .*payout_alerts/i.test(message) ||
    /column .*carer_payout_hold_reason.* does not exist/i.test(message) ||
    /could not find the .*carer_payout_hold_reason.* column/i.test(message)
  );
}

type AlertRow = {
  id: string;
  carer_id: string;
  booking_id: string | null;
  alert_type: string;
  stripe_payout_id: string | null;
  amount_cents: number | null;
  currency: string;
  state: string;
  created_at: string;
  notes: string | null;
};

type PerCarer = {
  carer_id: string;
  paid: AlertRow[];
  held: Array<AlertRow & { hold_reason: string | null }>;
  failed: AlertRow[];
};

function formatMoney(pence: number | null, currency: string): string {
  if (pence == null) return "—";
  const up = (currency ?? "gbp").toUpperCase();
  const symbol =
    up === "GBP" ? "£" : up === "USD" ? "$" : up === "EUR" ? "€" : `${up} `;
  return `${symbol}${(pence / 100).toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDigestEmail(bucket: PerCarer): {
  subject: string;
  html: string;
  text: string;
} {
  const parts: string[] = [];
  const textParts: string[] = [];
  if (bucket.paid.length > 0) {
    parts.push(
      `<h3 style="margin:16px 0 4px;color:#171E54;">Paid this week (${bucket.paid.length})</h3>`,
    );
    textParts.push(`Paid this week: ${bucket.paid.length}`);
  }
  if (bucket.held.length > 0) {
    const rows = bucket.held
      .map(
        (r) =>
          `<li>${escapeHtml(formatMoney(r.amount_cents, r.currency))} — held (${escapeHtml(
            r.hold_reason ?? "under review",
          )})</li>`,
      )
      .join("");
    parts.push(
      `<h3 style="margin:16px 0 4px;color:#171E54;">Held (${bucket.held.length})</h3><ul>${rows}</ul>`,
    );
    textParts.push(
      `\nHeld (${bucket.held.length}):\n` +
        bucket.held
          .map(
            (r) =>
              `  - ${formatMoney(r.amount_cents, r.currency)} — ${r.hold_reason ?? "under review"}`,
          )
          .join("\n"),
    );
  }
  if (bucket.failed.length > 0) {
    const rows = bucket.failed
      .map(
        (r) =>
          `<li>${escapeHtml(formatMoney(r.amount_cents, r.currency))} — failed${
            r.notes ? ` (${escapeHtml(r.notes)})` : ""
          }</li>`,
      )
      .join("");
    parts.push(
      `<h3 style="margin:16px 0 4px;color:#B91C1C;">Failed (${bucket.failed.length})</h3><ul>${rows}</ul>`,
    );
    textParts.push(
      `\nFailed (${bucket.failed.length}):\n` +
        bucket.failed
          .map(
            (r) =>
              `  - ${formatMoney(r.amount_cents, r.currency)}${
                r.notes ? ` (${r.notes})` : ""
              }`,
          )
          .join("\n"),
    );
  }

  const totalFailed = bucket.failed.length;
  const subject =
    totalFailed > 0
      ? `SpecialCarer: ${totalFailed} payout issue${totalFailed === 1 ? "" : "s"} this week`
      : `SpecialCarer: your weekly payout summary`;

  return {
    subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171E54;max-width:560px;">
        <h2 style="margin:0 0 8px;">Your payout summary — past 7 days</h2>
        <p style="color:#575757;">Here's what happened with your SpecialCarer payouts this week.</p>
        ${parts.join("")}
        <p style="margin-top:20px;"><a href="https://www.specialcarer.com/m/earnings" style="color:#039EA0;font-weight:600;">Open earnings →</a></p>
      </div>
    `,
    text: `Your payout summary — past 7 days\n\n${textParts.join("\n")}\n\nOpen earnings: https://www.specialcarer.com/m/earnings\n`,
  };
}

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const admin = createAdminClient();

  // Cut-off: alerts created in the past 7 days.
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const { data: alerts, error: alertsErr } = await admin
    .from("payout_alerts")
    .select(
      "id, carer_id, booking_id, alert_type, stripe_payout_id, amount_cents, currency, state, created_at, notes",
    )
    .gte("created_at", cutoffIso)
    .limit(5000);

  if (alertsErr) {
    if (isSchemaNotReady(alertsErr)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "schema_not_ready",
      });
    }
    return NextResponse.json(
      { error: (alertsErr as { message?: string }).message ?? "query failed" },
      { status: 500 },
    );
  }

  const rows = (alerts ?? []) as AlertRow[];

  // Bucket by carer.
  const perCarer = new Map<string, PerCarer>();
  const bookingIds = new Set<string>();
  for (const r of rows) {
    let bucket = perCarer.get(r.carer_id);
    if (!bucket) {
      bucket = { carer_id: r.carer_id, paid: [], held: [], failed: [] };
      perCarer.set(r.carer_id, bucket);
    }
    if (r.state === "resolved") {
      bucket.paid.push(r);
    } else if (r.alert_type.startsWith("held_")) {
      bucket.held.push({ ...r, hold_reason: null });
      if (r.booking_id) bookingIds.add(r.booking_id);
    } else {
      bucket.failed.push(r);
    }
  }

  // Attach hold reasons from bookings.carer_payout_hold_reason.
  if (bookingIds.size > 0) {
    const { data: bookings, error: bkErr } = await admin
      .from("bookings")
      .select("id, carer_payout_hold_reason")
      .in("id", Array.from(bookingIds));
    if (bkErr) {
      if (isSchemaNotReady(bkErr)) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "schema_not_ready",
        });
      }
      // Non-schema DB error: log and continue with null hold reasons —
      // digest still ships with the alert-level info.
      console.warn(
        "[cron.payout-digest-weekly] booking hold-reason lookup failed",
        bkErr,
      );
    } else {
      const reasonById = new Map<string, string | null>();
      for (const b of (bookings ?? []) as Array<{
        id: string;
        carer_payout_hold_reason: string | null;
      }>) {
        reasonById.set(b.id, b.carer_payout_hold_reason);
      }
      for (const bucket of perCarer.values()) {
        for (const h of bucket.held) {
          h.hold_reason = h.booking_id
            ? reasonById.get(h.booking_id) ?? null
            : null;
        }
      }
    }
  }

  // Look up carer emails in one batch.
  const carerIds = Array.from(perCarer.keys());
  const emailByCarer = new Map<string, string | null>();
  if (carerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", carerIds);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      email: string | null;
    }>) {
      emailByCarer.set(p.id, p.email);
    }
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const bucket of perCarer.values()) {
    if (
      bucket.paid.length === 0 &&
      bucket.held.length === 0 &&
      bucket.failed.length === 0
    ) {
      skipped += 1;
      continue;
    }
    const email = emailByCarer.get(bucket.carer_id);
    if (!email) {
      skipped += 1;
      continue;
    }
    try {
      const built = renderDigestEmail(bucket);
      const res = await sendEmail({ to: email, ...built });
      if (res.ok) {
        sent += 1;
      } else {
        errors.push(`${bucket.carer_id.slice(0, 8)}: ${res.error}`);
      }
    } catch (e) {
      errors.push(
        `${bucket.carer_id.slice(0, 8)}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_alerts: rows.length,
    carers_with_alerts: perCarer.size,
    digests_sent: sent,
    digests_skipped: skipped,
    errors,
  });
}
