/**
 * Timesheet approval / overage / FLSA constants.
 *
 * Locked product decisions (2026-05-11). Imported by:
 *   - /api/bookings/[id]/action            (computes overage on complete)
 *   - /api/bookings/[id]/timesheet/*       (approve/adjust/dispute)
 *   - /api/cron/auto-approve-timesheets
 *   - /api/cron/timesheet-reminders
 *   - /api/cron/finalise-org-invoices
 *   - UI banners + sheets
 *
 * Pure constants — no Supabase / Stripe imports so it stays safe to load
 * in client components (e.g. the FLSA banner).
 */
export const TIMESHEET_CONFIG = {
  /** Auto-approve window after carer check-out, in hours. */
  AUTO_APPROVE_HOURS: 48,
  /** Send reminder to seeker/org if no action by this point. */
  REMINDER_AFTER_HOURS: 24,
  /** Overage above this multiple of booked duration requires explicit approval. */
  OVERAGE_DURATION_THRESHOLD: 1.5,
  /** Cash cap (pence) above which overage requires explicit approval — UK. */
  OVERAGE_CASH_CAP_GBP_CENTS: 15000,
  /** Cash cap (cents) above which overage requires explicit approval — US. */
  OVERAGE_CASH_CAP_USD_CENTS: 20000,
  /** Round actual minutes up to the next multiple of this. */
  ROUND_MINUTES_UP_TO: 15,
  /** Surface a banner once weekly hours with the same carer hit this (FLSA early warning). */
  FLSA_ALERT_HOURS: 35,
  /** Hours above this are billed at 1.5× for US bookings (FLSA). */
  FLSA_OVERTIME_HOURS: 40,
  /** Multiplier applied to hours above FLSA_OVERTIME_HOURS. */
  FLSA_OVERTIME_MULTIPLIER: 1.5,
  /** Admin SLA for dispute resolution, hours. */
  DISPUTE_RESOLUTION_HOURS: 72,
} as const;

/**
 * Round minutes up to the nearest TIMESHEET_CONFIG.ROUND_MINUTES_UP_TO bucket.
 * 1 min → 15, 16 min → 30, 30 min → 30, 31 min → 45, etc.
 */
export function ceilToRoundedMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const bucket = TIMESHEET_CONFIG.ROUND_MINUTES_UP_TO;
  return Math.ceil(minutes / bucket) * bucket;
}

/**
 * Cash cap for the given currency. Falls back to GBP for unknown values
 * so we never miss flagging a runaway overage.
 */
export function overageCashCapCents(currency: string): number {
  const c = currency.toUpperCase();
  if (c === "USD") return TIMESHEET_CONFIG.OVERAGE_CASH_CAP_USD_CENTS;
  return TIMESHEET_CONFIG.OVERAGE_CASH_CAP_GBP_CENTS;
}

/**
 * Returns the reason flag set on the timesheet when overage requires explicit
 * approval. null when it doesn't.
 */
export function overageCapReason(args: {
  actualMinutes: number;
  bookedMinutes: number;
  overageCents: number;
  currency: string;
}): "duration_1.5x" | "cash_cap" | "both" | null {
  const overDuration =
    args.bookedMinutes > 0 &&
    args.actualMinutes > args.bookedMinutes * TIMESHEET_CONFIG.OVERAGE_DURATION_THRESHOLD;
  const overCash = args.overageCents > overageCashCapCents(args.currency);
  if (overDuration && overCash) return "both";
  if (overDuration) return "duration_1.5x";
  if (overCash) return "cash_cap";
  return null;
}
