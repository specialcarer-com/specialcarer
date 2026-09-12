/**
 * Fetch bookings eligible for payout capture, honouring the carer
 * `carer_payout_hold_reason` column added by PR #218 (dispute workflow).
 *
 * A non-null `carer_payout_hold_reason` means someone (currently only
 * the dispute-webhook, but the column is deliberately additive so other
 * feature paths can also write into it) has parked this booking out of
 * the payout batch. We must exclude those rows from capture.
 *
 * Deploy-safe
 * ───────────
 * The `carer_payout_hold_reason` column is added by migration
 * 20260912133500 (PR #218), which has NOT been applied to prod at the
 * time this companion PR ships. If the column is missing at query time,
 * Supabase surfaces PG error 42703 ("undefined_column"). We catch that,
 * log a warning, and re-run the SELECT WITHOUT the filter so the payout
 * cron keeps functioning unchanged. Once the migration lands, the first
 * filtered query succeeds and the hold becomes active on the next run.
 *
 * The fallback path preserves pre-#218 behaviour exactly — this file
 * is safe to deploy before, alongside, or after PR #218's code.
 *
 * Mirrors the `schema_not_ready` skip pattern from
 * `src/lib/stripe/dispute-webhook.ts` and `src/lib/payments/payout-hold.ts`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DueBookingsAdminClient = { from(table: string): any };

export type DueBookingRow = {
  id: string;
  status: string;
  payout_eligible_at: string | null;
};

export type FetchDueBookingsResult = {
  data: DueBookingRow[] | null;
  error: { message: string } | null;
  /** True if we fell back to the un-filtered query because the column is missing. */
  holdFilterSkipped: boolean;
};

// Postgres error code for undefined_column, surfaced when the
// `carer_payout_hold_reason` migration hasn't been applied yet.
const PG_UNDEFINED_COLUMN = "42703";

function isHoldColumnMissingError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  if (code === PG_UNDEFINED_COLUMN) return true;
  return /column .*carer_payout_hold_reason.* does not exist/i.test(message) ||
    /could not find the .*carer_payout_hold_reason.* column/i.test(message);
}

/**
 * Fetch bookings due for payout capture. Applies the hold filter,
 * with a deploy-safe fallback if the column doesn't exist yet.
 */
export async function fetchDueBookings(
  admin: DueBookingsAdminClient,
  nowIso: string = new Date().toISOString(),
): Promise<FetchDueBookingsResult> {
  const filtered = await admin
    .from("bookings")
    .select("id, status, payout_eligible_at")
    .eq("status", "completed")
    .neq("booking_source", "org")
    .lte("payout_eligible_at", nowIso)
    .is("carer_payout_hold_reason", null)
    .limit(100);

  if (!filtered.error) {
    return {
      data: (filtered.data ?? null) as DueBookingRow[] | null,
      error: null,
      holdFilterSkipped: false,
    };
  }

  if (!isHoldColumnMissingError(filtered.error)) {
    return {
      data: null,
      error: { message: (filtered.error as { message?: string }).message ?? "query failed" },
      holdFilterSkipped: false,
    };
  }

  console.warn(
    "[cron.release-payouts] carer_payout_hold_reason column not yet applied — payout hold inactive",
  );

  const fallback = await admin
    .from("bookings")
    .select("id, status, payout_eligible_at")
    .eq("status", "completed")
    .neq("booking_source", "org")
    .lte("payout_eligible_at", nowIso)
    .limit(100);

  return {
    data: (fallback.data ?? null) as DueBookingRow[] | null,
    error: fallback.error
      ? { message: (fallback.error as { message?: string }).message ?? "query failed" }
      : null,
    holdFilterSkipped: true,
  };
}
