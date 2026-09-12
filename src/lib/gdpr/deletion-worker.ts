/**
 * SpecialCarer — pure worker logic for self-service account deletion.
 *
 * The Next.js cron handler at
 * src/app/api/cron/account-deletion-worker/route.ts calls
 * runDeletionWorker() once per invocation. All Supabase / email
 * dependencies are injected so the worker can be exercised end-to-end
 * without a live environment.
 *
 * Batch semantics:
 *   * pick up to BATCH_LIMIT rows in state ∈ {in_progress, deferred}
 *     with resume_after IS NULL or resume_after <= now
 *   * for each row:
 *       - re-run eligibility (a booking may have been created after
 *         the token verify); if blocked, transition to blocked_* and
 *         skip
 *       - synthesize a bridging dsar_requests row so PR #210's
 *         handleDsarErase can write dsar_erasure_audit against a
 *         valid FK (audit table has ON DELETE RESTRICT to
 *         dsar_requests)
 *       - invoke handleDsarErase — on any deferred rows or persist
 *         errors, bump retry_count and set resume_after = now +
 *         RETRY_BACKOFF_MINUTES; on retry_count >= MAX_RETRIES
 *         terminate with blocked_reason='max_retries_exhausted'
 *       - on success, transition to state=complete, stamp
 *         manifest_version + audit_digest, and mail the completion
 *         summary
 *
 * Resumability comes from the state machine + resume_after +
 * retry_count fields on account_deletion_jobs; the worker itself is
 * stateless.
 */

import {
  checkEligibility,
  blockedStateFromBlockers,
  type EligibilityAdminClient,
  type EligibilityDeps,
} from "./deletion-eligibility";

const BATCH_LIMIT = 10;
const RETRY_BACKOFF_MINUTES = 15;
const MAX_RETRIES = 5;
const UNDEFINED_TABLE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkerAdminClient = { from(table: string): any };

export type DeletionJob = {
  id: string;
  user_id: string;
  requested_at: string;
  state: string;
  retry_count: number;
  resume_after: string | null;
};

export type ErasureAudit = {
  action: string;
  table_name: string;
  column_name: string | null;
  row_count: number;
  reason: string | null;
  retained_until: string | null;
};

export type EraseResult = {
  ok: true;
  audit: ErasureAudit[];
  deferred: unknown[];
  audit_persist_error: string | null;
  deferred_persist_error: string | null;
  request_persist_error: string | null;
  digest: string;
  version: string;
};

export type WorkerDeps = {
  admin: WorkerAdminClient & EligibilityAdminClient;
  /** Injectable to keep the worker's tests independent of PR #210. */
  runErase: (
    admin: WorkerAdminClient,
    input: { dsar_request_id: string; subject_email: string; subject_user_id: string | null; now?: Date },
  ) => Promise<EraseResult>;
  /**
   * Sends the completion email. Injected so tests can capture calls
   * without booting the SMTP transport.
   */
  sendCompletionEmail: (args: {
    to: string;
    job_id: string;
    audit: ErasureAudit[];
    manifest_version: string;
    digest: string;
    max_retained_until: string | null;
  }) => Promise<void>;
  /** Look up the subject email for the account (auth.users). */
  lookupUserEmail: (user_id: string) => Promise<string | null>;
  eligibility?: Partial<Omit<EligibilityDeps, "db">>;
  now?: Date;
};

export type WorkerRunResult = {
  ok: true;
  processed: number;
  results: Array<{
    job_id: string;
    outcome:
      | "complete"
      | "deferred"
      | "blocked"
      | "max_retries_exhausted"
      | "no_email"
      | "erase_error";
    detail?: string;
  }>;
  skipped?: "schema_not_ready";
};

export async function runDeletionWorker(
  deps: WorkerDeps,
): Promise<WorkerRunResult> {
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();

  // ── Pull the batch ──
  //
  // We split the query into two — first the never-tried rows
  // (resume_after IS NULL), then the retry-scheduled rows whose
  // resume_after has arrived. Using two calls keeps the PostgREST
  // filter simple and matches the partial index we defined in the
  // migration.
  const { data: freshRows, error: freshError } = await deps.admin
    .from("account_deletion_jobs")
    .select("id, user_id, requested_at, state, retry_count, resume_after")
    .in("state", ["in_progress", "deferred"])
    .is("resume_after", null)
    .order("requested_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (freshError) {
    if (freshError.code === UNDEFINED_TABLE) {
      return { ok: true, processed: 0, results: [], skipped: "schema_not_ready" };
    }
    // Any other error is treated as "nothing to do this tick" — the
    // next tick will retry.
    return { ok: true, processed: 0, results: [] };
  }

  const rows: DeletionJob[] = [...((freshRows ?? []) as DeletionJob[])];
  const remainingBudget = BATCH_LIMIT - rows.length;
  if (remainingBudget > 0) {
    const { data: retryRows } = await deps.admin
      .from("account_deletion_jobs")
      .select("id, user_id, requested_at, state, retry_count, resume_after")
      .in("state", ["in_progress", "deferred"])
      .lte("resume_after", nowIso)
      .order("resume_after", { ascending: true })
      .limit(remainingBudget);
    rows.push(...((retryRows ?? []) as DeletionJob[]));
  }

  const results: WorkerRunResult["results"] = [];

  for (const job of rows) {
    // ── Re-check eligibility ──
    const eligibility = await checkEligibility(job.user_id, {
      db: deps.admin,
      ...(deps.eligibility ?? {}),
    });
    if (!eligibility.eligible) {
      await deps.admin
        .from("account_deletion_jobs")
        .update({
          state: blockedStateFromBlockers(eligibility.blockers),
          blocker_codes: eligibility.blockers.map((b) => b.code),
          blocked_reason: eligibility.blockers.map((b) => b.message).join(" "),
          updated_at: nowIso,
        })
        .eq("id", job.id);
      results.push({ job_id: job.id, outcome: "blocked" });
      continue;
    }

    // ── Look up email ──
    const email = await deps.lookupUserEmail(job.user_id);
    if (!email) {
      // No email = no way to send the completion notice. Defer once
      // (maybe the auth.users row just hasn't propagated) but treat
      // repeated failure as a terminal condition — the erasure
      // itself would run fine, but the audit disclosure has to reach
      // the subject.
      const retry_count = (job.retry_count ?? 0) + 1;
      if (retry_count >= MAX_RETRIES) {
        await deps.admin
          .from("account_deletion_jobs")
          .update({
            state: "deferred",
            retry_count,
            blocked_reason: "max_retries_exhausted:no_email_for_user",
            updated_at: nowIso,
          })
          .eq("id", job.id);
        results.push({ job_id: job.id, outcome: "max_retries_exhausted", detail: "no_email" });
      } else {
        const resume_after = new Date(now.getTime() + RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString();
        await deps.admin
          .from("account_deletion_jobs")
          .update({ state: "deferred", retry_count, resume_after, updated_at: nowIso })
          .eq("id", job.id);
        results.push({ job_id: job.id, outcome: "no_email" });
      }
      continue;
    }

    // ── Bridge row so PR #210's handler has a dsar_requests FK to
    // hang the audit off. state='in_progress' so its final
    // update({state:'erased'}) succeeds under the check constraint.
    const { data: bridge, error: bridgeError } = await deps.admin
      .from("dsar_requests")
      .insert({
        subject_user_id: job.user_id,
        subject_email: email,
        request_type: "erasure",
        state: "in_progress",
        verified_at: nowIso,
        notes: `Self-service account deletion. account_deletion_jobs.id=${job.id}`,
      })
      .select("id")
      .single();
    if (bridgeError) {
      // Bridge failure means we cannot legally attribute the audit
      // rows. Defer with retry.
      const retry_count = (job.retry_count ?? 0) + 1;
      if (retry_count >= MAX_RETRIES) {
        await deps.admin
          .from("account_deletion_jobs")
          .update({
            state: "deferred",
            retry_count,
            blocked_reason: "max_retries_exhausted:" + (bridgeError.message ?? "bridge_error"),
            updated_at: nowIso,
          })
          .eq("id", job.id);
        results.push({ job_id: job.id, outcome: "max_retries_exhausted", detail: bridgeError.message });
      } else {
        await deps.admin
          .from("account_deletion_jobs")
          .update({
            state: "deferred",
            retry_count,
            resume_after: new Date(now.getTime() + RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString(),
            blocked_reason: bridgeError.message?.slice(0, 500) ?? "bridge_error",
            updated_at: nowIso,
          })
          .eq("id", job.id);
        results.push({ job_id: job.id, outcome: "deferred", detail: bridgeError.message });
      }
      continue;
    }
    const dsarRequestId = (bridge as { id: string }).id;

    // ── Run the erasure ──
    let erase: EraseResult;
    try {
      erase = await deps.runErase(deps.admin, {
        dsar_request_id: dsarRequestId,
        subject_email: email,
        subject_user_id: job.user_id,
        now,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retry_count = (job.retry_count ?? 0) + 1;
      const terminal = retry_count >= MAX_RETRIES;
      await deps.admin
        .from("account_deletion_jobs")
        .update({
          state: "deferred",
          retry_count,
          resume_after: terminal
            ? null
            : new Date(now.getTime() + RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString(),
          blocked_reason: (terminal ? "max_retries_exhausted:" : "") + message.slice(0, 400),
          updated_at: nowIso,
        })
        .eq("id", job.id);
      results.push({
        job_id: job.id,
        outcome: terminal ? "max_retries_exhausted" : "erase_error",
        detail: message,
      });
      continue;
    }

    // ── Handle deferrals / persist errors from the handler ──
    const hadDeferrals =
      (erase.deferred?.length ?? 0) > 0 ||
      erase.audit_persist_error !== null ||
      erase.deferred_persist_error !== null;

    if (hadDeferrals) {
      const retry_count = (job.retry_count ?? 0) + 1;
      const terminal = retry_count >= MAX_RETRIES;
      const summary = [
        erase.audit_persist_error && `audit:${erase.audit_persist_error}`,
        erase.deferred_persist_error && `deferred:${erase.deferred_persist_error}`,
        erase.deferred?.length && `deferred_rows:${erase.deferred.length}`,
      ]
        .filter(Boolean)
        .join(" ");
      await deps.admin
        .from("account_deletion_jobs")
        .update({
          state: "deferred",
          retry_count,
          resume_after: terminal
            ? null
            : new Date(now.getTime() + RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString(),
          blocked_reason: (terminal ? "max_retries_exhausted:" : "") + summary.slice(0, 400),
          updated_at: nowIso,
        })
        .eq("id", job.id);
      results.push({
        job_id: job.id,
        outcome: terminal ? "max_retries_exhausted" : "deferred",
        detail: summary,
      });
      continue;
    }

    // ── Success — transition to complete + email ──
    const max_retained_until =
      erase.audit
        .map((r) => r.retained_until)
        .filter((d): d is string => typeof d === "string")
        .sort()
        .pop() ?? null;

    await deps.admin
      .from("account_deletion_jobs")
      .update({
        state: "complete",
        completed_at: nowIso,
        manifest_version: erase.version,
        audit_digest: erase.digest,
        updated_at: nowIso,
      })
      .eq("id", job.id);

    try {
      await deps.sendCompletionEmail({
        to: email,
        job_id: job.id,
        audit: erase.audit,
        manifest_version: erase.version,
        digest: erase.digest,
        max_retained_until,
      });
    } catch (err) {
      // Log-only; the audit trail is already sealed in dsar_erasure_audit.
      // eslint-disable-next-line no-console
      console.error("[deletion-worker] completion email failed", job.id, err);
    }

    results.push({ job_id: job.id, outcome: "complete", detail: erase.digest });
  }

  return { ok: true, processed: rows.length, results };
}

export const DELETION_WORKER_CONSTANTS = {
  BATCH_LIMIT,
  RETRY_BACKOFF_MINUTES,
  MAX_RETRIES,
};
