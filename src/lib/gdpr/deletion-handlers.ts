/**
 * SpecialCarer — pure handlers for the self-service deletion endpoints.
 *
 * The Next.js route wrappers in src/app/api/account/delete/{submit,
 * verify,cancel}/route.ts unwrap the request (auth, JSON body, params)
 * and then delegate to the handlers here. Keeping the handlers pure +
 * deps-injectable is what makes the routes testable without a live
 * Supabase / next-auth environment.
 *
 * Each handler returns a plain result object which the route serialises
 * into a NextResponse. Errors are values, not exceptions — the caller
 * decides the HTTP status.
 */

import {
  checkEligibility,
  blockedStateFromBlockers,
  type EligibilityAdminClient,
  type EligibilityDeps,
} from "./deletion-eligibility";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DeletionAdminClient = { from(table: string): any };

const UNDEFINED_TABLE = "42P01";
const VERIFY_TTL_HOURS = 24;

export const CANCELLABLE_STATES = [
  "submitted",
  "verifying",
  "blocked_active_booking",
  "blocked_active_dispute",
  "blocked_open_notifiable_event",
  "blocked_outstanding_payout",
  "blocked_other",
] as const;

// ── handleSubmit ──────────────────────────────────────────────────────────

export type SubmitInput = {
  user_id: string;
  user_email: string;
  raw_token: string;
  token_hash: string;
  now: Date;
};

export type SubmitResult =
  | { ok: true; job: Record<string, unknown>; eligibility: { eligible: boolean; blockers: unknown[] }; email_pending: boolean }
  | { ok: false; code: "schema_not_ready" }
  | { ok: false; code: "insert_failed"; message: string };

export type SubmitDeps = {
  admin: DeletionAdminClient & EligibilityAdminClient;
  eligibility?: Partial<Omit<EligibilityDeps, "db">>;
};

export async function handleSubmit(
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const eligibility = await checkEligibility(input.user_id, {
    db: deps.admin,
    ...(deps.eligibility ?? {}),
  });

  const expiresAt = new Date(
    input.now.getTime() + VERIFY_TTL_HOURS * 60 * 60 * 1000,
  );

  const state = eligibility.eligible
    ? "submitted"
    : blockedStateFromBlockers(eligibility.blockers);
  const blocker_codes = eligibility.eligible
    ? null
    : eligibility.blockers.map((b) => b.code);
  const blocked_reason = eligibility.eligible
    ? null
    : eligibility.blockers.map((b) => b.message).join(" ");

  const { data, error } = await deps.admin
    .from("account_deletion_jobs")
    .insert({
      user_id: input.user_id,
      verification_token_hash: input.token_hash,
      verification_token_expires_at: expiresAt.toISOString(),
      state,
      blocker_codes,
      blocked_reason,
    })
    .select("id, state, blocker_codes, blocked_reason, requested_at")
    .single();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { ok: false, code: "schema_not_ready" };
    }
    return { ok: false, code: "insert_failed", message: error.message ?? "" };
  }

  return {
    ok: true,
    job: data,
    eligibility: {
      eligible: eligibility.eligible,
      blockers: eligibility.blockers,
    },
    email_pending: eligibility.eligible,
  };
}

// ── handleVerify ──────────────────────────────────────────────────────────

export type VerifyInput = {
  user_id: string;
  token_hash: string;
  now: Date;
};

export type VerifyResult =
  | { ok: true; job: Record<string, unknown>; eligibility: { eligible: boolean; blockers: unknown[] }; idempotent?: boolean }
  | { ok: false; code:
      | "schema_not_ready"
      | "token_not_found"
      | "token_expired"
      | "already_cancelled"
      | "lookup_failed"
      | "update_failed"; job?: Record<string, unknown> };

export async function handleVerify(
  input: VerifyInput,
  deps: SubmitDeps,
): Promise<VerifyResult> {
  const { data: job, error } = await deps.admin
    .from("account_deletion_jobs")
    .select("id, user_id, state, verification_token_expires_at, cancelled_at, verified_at")
    .eq("verification_token_hash", input.token_hash)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, code: "schema_not_ready" };
    return { ok: false, code: "lookup_failed" };
  }
  if (!job) return { ok: false, code: "token_not_found" };
  if (job.user_id !== input.user_id) return { ok: false, code: "token_not_found" };
  if (job.state === "cancelled") return { ok: false, code: "already_cancelled", job };
  if (job.state === "in_progress" || job.state === "complete" || job.state === "deferred") {
    return {
      ok: true,
      job,
      idempotent: true,
      eligibility: { eligible: true, blockers: [] },
    };
  }
  if (new Date(job.verification_token_expires_at).getTime() < input.now.getTime()) {
    return { ok: false, code: "token_expired", job };
  }

  const eligibility = await checkEligibility(input.user_id, {
    db: deps.admin,
    ...(deps.eligibility ?? {}),
  });
  const patch: Record<string, unknown> = {
    verified_at: input.now.toISOString(),
    verification_token_hash: "consumed:" + input.token_hash.slice(0, 12),
    updated_at: input.now.toISOString(),
  };
  if (eligibility.eligible) {
    patch.state = "in_progress";
    patch.blocker_codes = null;
    patch.blocked_reason = null;
  } else {
    patch.state = blockedStateFromBlockers(eligibility.blockers);
    patch.blocker_codes = eligibility.blockers.map((b) => b.code);
    patch.blocked_reason = eligibility.blockers.map((b) => b.message).join(" ");
  }

  const { data: updated, error: updateError } = await deps.admin
    .from("account_deletion_jobs")
    .update(patch)
    .eq("id", job.id)
    .select("id, state, blocker_codes, blocked_reason, verified_at")
    .single();
  if (updateError) return { ok: false, code: "update_failed" };
  return {
    ok: true,
    job: updated,
    eligibility: {
      eligible: eligibility.eligible,
      blockers: eligibility.blockers,
    },
  };
}

// ── handleCancel ──────────────────────────────────────────────────────────

export type CancelInput = {
  user_id: string;
  job_id: string;
  now: Date;
};

export type CancelResult =
  | { ok: true; job: Record<string, unknown> }
  | { ok: false; code:
      | "schema_not_ready"
      | "job_not_found"
      | "forbidden"
      | "not_cancellable"
      | "lookup_failed"
      | "update_failed"; state?: string };

export async function handleCancel(
  input: CancelInput,
  deps: { admin: DeletionAdminClient },
): Promise<CancelResult> {
  const { data: job, error } = await deps.admin
    .from("account_deletion_jobs")
    .select("id, user_id, state")
    .eq("id", input.job_id)
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { ok: false, code: "schema_not_ready" };
    return { ok: false, code: "lookup_failed" };
  }
  if (!job) return { ok: false, code: "job_not_found" };
  if (job.user_id !== input.user_id) return { ok: false, code: "forbidden" };
  if (!CANCELLABLE_STATES.includes(job.state)) {
    return { ok: false, code: "not_cancellable", state: job.state };
  }
  const { data: updated, error: updateError } = await deps.admin
    .from("account_deletion_jobs")
    .update({
      state: "cancelled",
      cancelled_at: input.now.toISOString(),
      updated_at: input.now.toISOString(),
      verification_token_hash: "cancelled:" + job.id.slice(0, 8),
    })
    .eq("id", job.id)
    .eq("user_id", input.user_id)
    .select("id, state, cancelled_at")
    .single();
  if (updateError) return { ok: false, code: "update_failed" };
  return { ok: true, job: updated };
}
