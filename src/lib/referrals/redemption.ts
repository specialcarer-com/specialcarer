import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Referral-credit redemption — server-side business logic for applying
 * accrued referral credit against a booking total at checkout.
 *
 * Invariants:
 *  - Platform absorbs the discount. `bookings.total_cents` does NOT change
 *    when credit is applied (carer payout is computed from that value).
 *    Only the seeker's PaymentIntent amount is reduced.
 *  - Per-booking cap = 50% of the booking total.
 *  - FIFO consumption (oldest non-expired non-redeemed credit first).
 *  - When the last credit row is only partially consumed, the row is split:
 *    the existing row shrinks to the unconsumed remainder and a NEW redeemed
 *    row of the consumed portion is inserted (reason='adjustment') so the
 *    ledger remains balanced and auditable.
 *  - Refund/cancel un-redeem only restores credits where expires_at > now()
 *    — expired credits stay spent.
 */

export const CREDIT_CAP_RATIO = 0.5;

const PRE_PAYMENT_STATUSES = new Set(["pending", "accepted"]);

export type ReferralCreditRow = {
  id: string;
  user_id: string;
  claim_id: string;
  amount_cents: number;
  currency: string;
  reason: "referrer_reward" | "referee_reward" | "adjustment";
  redeemed_at: string | null;
  redeemed_booking_id: string | null;
  expires_at: string;
  created_at: string;
};

type MinimalBooking = {
  id: string;
  seeker_id: string;
  status: string;
  total_cents: number;
  referral_credit_applied_cents: number | null;
};

/**
 * Pure: max credit applicable to a single booking given the user's
 * currently available balance.
 *
 *   appliedCap = floor(bookingTotal * 0.5)
 *   max       = min(availableBalance, appliedCap)
 *
 * Defensive against negative inputs (returns 0) and non-integers.
 */
export function computeMaxApplicableCents(
  bookingTotalCents: number,
  availableBalanceCents: number,
): number {
  if (!Number.isFinite(bookingTotalCents) || bookingTotalCents <= 0) return 0;
  if (!Number.isFinite(availableBalanceCents) || availableBalanceCents <= 0) {
    return 0;
  }
  const cap = Math.floor(bookingTotalCents * CREDIT_CAP_RATIO);
  return Math.max(0, Math.min(Math.floor(availableBalanceCents), cap));
}

export type ApplyCreditError =
  | { code: "booking_not_found"; message: string }
  | { code: "forbidden"; message: string }
  | { code: "invalid_status"; message: string }
  | { code: "already_applied"; message: string }
  | { code: "no_balance"; message: string }
  | { code: "invalid_amount"; message: string }
  | { code: "internal"; message: string };

export type ApplyCreditResult = {
  appliedCents: number;
  newTotalCents: number;
  consumedCreditIds: string[];
};

/**
 * Apply referral credit to a booking. Caller MUST have already verified that
 * `userId` is authenticated; this function re-checks ownership against the
 * booking row before mutating anything.
 *
 * Returns an error object instead of throwing for validation failures so the
 * caller can map directly to an HTTP status.
 *
 * Steps:
 *   1. Load booking; verify seeker_id, pre-payment status, no prior credit.
 *   2. Load user's non-expired non-redeemed credits ordered by created_at.
 *   3. appliedCents = min(requestedCents, computeMaxApplicableCents(total, balance))
 *   4. FIFO-consume credits. If the last touched credit only partially
 *      covers the remaining target, split it (shrink + insert adjustment).
 *   5. Stamp bookings.referral_credit_applied_cents / _at.
 */
export async function applyCreditToBooking(args: {
  supabase: SupabaseClient;
  bookingId: string;
  userId: string;
  requestedCents?: number;
}): Promise<{ ok: true; value: ApplyCreditResult } | { ok: false; error: ApplyCreditError }> {
  const { supabase, bookingId, userId } = args;

  if (
    args.requestedCents !== undefined &&
    (!Number.isFinite(args.requestedCents) || args.requestedCents <= 0)
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_amount",
        message: "requestedCents must be a positive integer",
      },
    };
  }

  const bookingQ = await supabase
    .from("bookings")
    .select(
      "id, seeker_id, status, total_cents, referral_credit_applied_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();
  const booking = bookingQ.data as MinimalBooking | null;
  if (!booking) {
    return {
      ok: false,
      error: { code: "booking_not_found", message: "Booking not found" },
    };
  }
  if (booking.seeker_id !== userId) {
    return {
      ok: false,
      error: { code: "forbidden", message: "Not your booking" },
    };
  }
  if (!PRE_PAYMENT_STATUSES.has(booking.status)) {
    return {
      ok: false,
      error: {
        code: "invalid_status",
        message: `Cannot apply credit to a booking in status ${booking.status}`,
      },
    };
  }
  if ((booking.referral_credit_applied_cents ?? 0) > 0) {
    return {
      ok: false,
      error: {
        code: "already_applied",
        message:
          "Booking already has credit applied — remove it first to change the amount",
      },
    };
  }

  // Load this user's eligible credits, FIFO. We do oldest-first so
  // credits that are closer to expiry burn first.
  const nowIso = new Date().toISOString();
  const creditsQ = await supabase
    .from("referral_credits")
    .select(
      "id, user_id, claim_id, amount_cents, currency, reason, redeemed_at, redeemed_booking_id, expires_at, created_at",
    )
    .eq("user_id", userId)
    .is("redeemed_at", null);
  const all = (creditsQ.data ?? []) as ReferralCreditRow[];
  const eligible = all
    .filter((c) => !c.redeemed_at && c.expires_at > nowIso)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  const availableBalance = eligible.reduce(
    (sum, c) => sum + (c.amount_cents ?? 0),
    0,
  );
  const maxApplicable = computeMaxApplicableCents(
    booking.total_cents,
    availableBalance,
  );
  if (availableBalance <= 0 || maxApplicable <= 0) {
    return {
      ok: false,
      error: {
        code: "no_balance",
        message: "No applicable credit available for this booking",
      },
    };
  }
  const requested =
    args.requestedCents !== undefined
      ? Math.floor(args.requestedCents)
      : maxApplicable;
  const target = Math.max(0, Math.min(requested, maxApplicable));
  if (target <= 0) {
    return {
      ok: false,
      error: {
        code: "no_balance",
        message: "Requested credit is below 1 cent",
      },
    };
  }

  // FIFO consume.
  let remaining = target;
  const consumedCreditIds: string[] = [];
  for (const row of eligible) {
    if (remaining <= 0) break;
    if (row.amount_cents <= remaining) {
      // Whole row goes; mark redeemed.
      const upd = await supabase
        .from("referral_credits")
        .update({
          redeemed_at: new Date().toISOString(),
          redeemed_booking_id: bookingId,
        })
        .eq("id", row.id)
        .is("redeemed_at", null);
      if (upd.error) {
        return {
          ok: false,
          error: { code: "internal", message: upd.error.message },
        };
      }
      remaining -= row.amount_cents;
      consumedCreditIds.push(row.id);
    } else {
      // Partial last credit. Split: shrink existing row, insert a new
      // redeemed adjustment row for the consumed portion (same claim_id).
      const consumed = remaining;
      const leftover = row.amount_cents - consumed;
      const shrink = await supabase
        .from("referral_credits")
        .update({ amount_cents: leftover })
        .eq("id", row.id)
        .is("redeemed_at", null);
      if (shrink.error) {
        return {
          ok: false,
          error: { code: "internal", message: shrink.error.message },
        };
      }
      const ins = await supabase
        .from("referral_credits")
        .insert({
          user_id: row.user_id,
          claim_id: row.claim_id,
          amount_cents: consumed,
          currency: row.currency,
          reason: "adjustment",
          redeemed_at: new Date().toISOString(),
          redeemed_booking_id: bookingId,
          expires_at: row.expires_at,
        })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        return {
          ok: false,
          error: {
            code: "internal",
            message: ins.error?.message ?? "Failed to insert split credit",
          },
        };
      }
      remaining = 0;
      consumedCreditIds.push((ins.data as { id: string }).id);
      break;
    }
  }

  const appliedCents = target - remaining;
  // Stamp booking. Guard against a concurrent apply: only update when
  // referral_credit_applied_cents is still 0.
  const stampedAt = new Date().toISOString();
  const stamp = await supabase
    .from("bookings")
    .update({
      referral_credit_applied_cents: appliedCents,
      referral_credit_applied_at: stampedAt,
      updated_at: stampedAt,
    })
    .eq("id", bookingId)
    .eq("referral_credit_applied_cents", 0);
  if (stamp.error) {
    return {
      ok: false,
      error: { code: "internal", message: stamp.error.message },
    };
  }

  return {
    ok: true,
    value: {
      appliedCents,
      newTotalCents: booking.total_cents - appliedCents,
      consumedCreditIds,
    },
  };
}

/**
 * Reverse a previous redemption — used on booking cancel / Stripe refund.
 *
 * Restores `redeemed_at` / `redeemed_booking_id` to NULL on every credit
 * tagged to this booking, but ONLY where the credit has not expired in the
 * meantime. Expired-while-spent credits stay spent. Resets the booking's
 * applied counter to zero.
 *
 * Idempotent: a no-op on a booking that has nothing to un-redeem.
 */
export async function unredeemCreditsForBooking(args: {
  supabase: SupabaseClient;
  bookingId: string;
}): Promise<{ unredeemedCents: number; restoredCreditIds: string[] }> {
  const { supabase, bookingId } = args;
  const nowIso = new Date().toISOString();

  const creditsQ = await supabase
    .from("referral_credits")
    .select("id, amount_cents, expires_at, redeemed_at")
    .eq("redeemed_booking_id", bookingId);
  const rows = (creditsQ.data ?? []) as Array<{
    id: string;
    amount_cents: number;
    expires_at: string;
    redeemed_at: string | null;
  }>;

  const restoredCreditIds: string[] = [];
  let unredeemedCents = 0;
  for (const r of rows) {
    if (!r.redeemed_at) continue; // already cleared
    if (r.expires_at <= nowIso) continue; // expired-while-spent stays spent
    const upd = await supabase
      .from("referral_credits")
      .update({ redeemed_at: null, redeemed_booking_id: null })
      .eq("id", r.id)
      .eq("redeemed_booking_id", bookingId);
    if (!upd.error) {
      restoredCreditIds.push(r.id);
      unredeemedCents += r.amount_cents;
    }
  }

  // Reset booking counter. Safe to call even when nothing changed.
  await supabase
    .from("bookings")
    .update({
      referral_credit_applied_cents: 0,
      referral_credit_applied_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  return { unredeemedCents, restoredCreditIds };
}
