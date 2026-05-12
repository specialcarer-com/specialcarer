import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveReferralCode } from "./code";
import {
  REFERRAL_REWARD_CENTS,
  REFERRAL_CURRENCY,
  REFERRAL_EXPIRY_DAYS,
} from "./config";

export type ClaimResult =
  | { ok: true; status: "pending"; amount_cents: number; claim_id: string }
  | { ok: false; error: string; code: number };

export type QualifyResult =
  | { ok: true; credited: boolean; claim_id: string }
  | { ok: false; error: string; code: number };

/**
 * Look up the user's referral code, lazily creating one if missing.
 * Handles a one-shot collision retry — if the deterministic suffix has
 * already been issued to someone else, append a second random suffix.
 */
export async function getOrCreateReferralCode(
  admin: SupabaseClient,
  userId: string,
  fullName: string | null,
): Promise<string> {
  const existing = await admin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.data?.code) return existing.data.code;

  let candidate = deriveReferralCode(fullName, userId);
  // Best-effort collision handling — try the deterministic value first,
  // then suffix with a 3-char tail derived from the user id.
  for (let attempt = 0; attempt < 4; attempt++) {
    const ins = await admin
      .from("referral_codes")
      .insert({ user_id: userId, code: candidate })
      .select("code")
      .maybeSingle();
    if (!ins.error && ins.data?.code) return ins.data.code;
    // Unique violation — try a perturbed candidate.
    candidate = `${candidate}${attempt}`;
  }
  throw new Error("Could not allocate referral code after retries");
}

/**
 * Record a referral claim. Caller has already authenticated the referred
 * user; we still re-check the basics here (self-referral, double-claim,
 * expired code).
 */
export async function recordClaim(
  admin: SupabaseClient,
  args: { code: string; referredUserId: string },
): Promise<ClaimResult> {
  const trimmed = (args.code ?? "").trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Missing code", code: 400 };

  const codeRow = await admin
    .from("referral_codes")
    .select("user_id, created_at")
    .eq("code", trimmed)
    .maybeSingle();
  if (!codeRow.data) return { ok: false, error: "Unknown code", code: 404 };

  const referrerId = codeRow.data.user_id as string;
  if (referrerId === args.referredUserId) {
    return { ok: false, error: "Cannot refer yourself", code: 400 };
  }

  // A user can only be referred once — enforced by UNIQUE constraint, but
  // we check up-front so we can return a clearer error.
  const existing = await admin
    .from("referral_claims")
    .select("id, status")
    .eq("referred_id", args.referredUserId)
    .maybeSingle();
  if (existing.data) {
    return { ok: false, error: "Already claimed a referral", code: 409 };
  }

  const expiresAt = new Date(
    Date.now() + REFERRAL_EXPIRY_DAYS * 86400 * 1000,
  ).toISOString();

  const ins = await admin
    .from("referral_claims")
    .insert({
      code: trimmed,
      referrer_id: referrerId,
      referred_id: args.referredUserId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle();
  if (ins.error || !ins.data) {
    return {
      ok: false,
      error: ins.error?.message ?? "Insert failed",
      code: 500,
    };
  }

  return {
    ok: true,
    status: "pending",
    amount_cents: REFERRAL_REWARD_CENTS,
    claim_id: ins.data.id as string,
  };
}

/**
 * Move a pending claim to qualified and write the two £20 credits
 * (referrer + referee). Idempotent — the unique index on
 * (claim_id, reason) protects against duplicate writes if this hook
 * fires twice for the same booking.
 *
 * `bookingId` is optional — pass it through when called from the
 * booking-settle hook so we can tag the qualifying booking on the claim.
 */
export async function qualifyClaim(
  admin: SupabaseClient,
  args: { claimId: string; bookingId?: string },
): Promise<QualifyResult> {
  const claim = await admin
    .from("referral_claims")
    .select("id, referrer_id, referred_id, status, expires_at")
    .eq("id", args.claimId)
    .maybeSingle();
  if (!claim.data) return { ok: false, error: "Claim not found", code: 404 };

  if (claim.data.status === "expired" || claim.data.status === "void") {
    return { ok: false, error: `Claim is ${claim.data.status}`, code: 400 };
  }
  if (claim.data.status !== "qualified") {
    const upd = await admin
      .from("referral_claims")
      .update({
        status: "qualified",
        qualified_at: new Date().toISOString(),
        qualifying_booking_id: args.bookingId ?? null,
      })
      .eq("id", args.claimId)
      .eq("status", "pending");
    if (upd.error) {
      return { ok: false, error: upd.error.message, code: 500 };
    }
  }

  // Idempotent credit writes — onConflict on the (claim_id, reason)
  // unique index means a re-run is a no-op.
  const rows = [
    {
      user_id: claim.data.referrer_id,
      claim_id: claim.data.id,
      amount_cents: REFERRAL_REWARD_CENTS,
      currency: REFERRAL_CURRENCY,
      reason: "referrer_reward",
    },
    {
      user_id: claim.data.referred_id,
      claim_id: claim.data.id,
      amount_cents: REFERRAL_REWARD_CENTS,
      currency: REFERRAL_CURRENCY,
      reason: "referee_reward",
    },
  ];
  const credIns = await admin
    .from("referral_credits")
    .upsert(rows, { onConflict: "claim_id,reason", ignoreDuplicates: true });
  if (credIns.error) {
    return { ok: false, error: credIns.error.message, code: 500 };
  }

  return { ok: true, credited: true, claim_id: claim.data.id as string };
}

/**
 * Find a pending claim where this user is the referee — used by the
 * booking-settle hook so an admin doesn't have to qualify manually.
 */
export async function findPendingClaimForUser(
  admin: SupabaseClient,
  referredUserId: string,
): Promise<{ id: string } | null> {
  const r = await admin
    .from("referral_claims")
    .select("id, expires_at")
    .eq("referred_id", referredUserId)
    .eq("status", "pending")
    .maybeSingle();
  if (!r.data) return null;
  if (new Date(r.data.expires_at).getTime() < Date.now()) return null;
  return { id: r.data.id as string };
}
