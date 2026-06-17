/**
 * Pure-ish handler for the DBS Update Service daily poll.
 *
 * Kept separate from route.ts so it can be unit-tested with a stubbed client +
 * vendor (mirrors expire-handler / refresh-handler). The route wraps the real
 * Supabase admin client + uCheck vendor and forwards the result.
 */

import type {
  DbsVendor,
  UpdateServiceStatus,
} from "@/lib/dbs/vendor";

/** Minimum age before we re-poll a row (23h, so a daily cron always catches it). */
const RECHECK_MIN_AGE_MS = 23 * 60 * 60 * 1000;

export type DueRow = {
  id: string;
  carer_id: string;
  certificate_number: string | null;
  update_service_last_checked_at: string | null;
};

/**
 * Narrow Supabase surface the handler needs. The route adapts createAdminClient()
 * to this; tests pass an in-memory stub.
 */
export type PollClient = {
  /** Rows enrolled + approved that are due a recheck. */
  fetchDueRows(cutoffIso: string): Promise<DueRow[]>;
  /** clear → just bump the last-checked timestamp. */
  markChecked(applicationId: string, nowIso: string): Promise<void>;
  /** change_pending → flag the application + carer overall status. */
  markChangePending(
    applicationId: string,
    carerId: string,
    nowIso: string,
  ): Promise<void>;
  /** invalidated → expire the application + suspend the carer from search. */
  markInvalidated(
    applicationId: string,
    carerId: string,
    nowIso: string,
  ): Promise<void>;
};

/** Notification hook — real impl sends email (Resend); tests count calls. */
export type PollNotifier = {
  adminChangePending(carerId: string): Promise<void>;
  adminInvalidated(carerId: string): Promise<void>;
  carerInvalidated(carerId: string): Promise<void>;
};

export type PollDeps = {
  admin: PollClient;
  vendor: DbsVendor;
  notify?: PollNotifier;
  now?: () => Date;
};

export type PollSummary = {
  checked: number;
  clear: number;
  change_pending: number;
  invalidated: number;
  skipped: number;
  errors: { id: string; message: string }[];
};

export async function pollUpdateService(
  deps: PollDeps,
): Promise<PollSummary> {
  const now = deps.now ? deps.now() : new Date();
  const cutoffIso = new Date(now.getTime() - RECHECK_MIN_AGE_MS).toISOString();
  const nowIso = now.toISOString();

  const rows = await deps.admin.fetchDueRows(cutoffIso);

  const summary: PollSummary = {
    checked: 0,
    clear: 0,
    change_pending: 0,
    invalidated: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    if (!row.certificate_number) {
      summary.skipped += 1;
      continue;
    }
    summary.checked += 1;
    try {
      const { status } = await deps.vendor.getUpdateServiceStatus(
        row.certificate_number,
      );
      await applyOutcome(deps, status, row, nowIso, summary);
    } catch (e) {
      summary.errors.push({
        id: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return summary;
}

async function applyOutcome(
  deps: PollDeps,
  status: UpdateServiceStatus,
  row: DueRow,
  nowIso: string,
  summary: PollSummary,
): Promise<void> {
  switch (status) {
    case "clear":
      await deps.admin.markChecked(row.id, nowIso);
      summary.clear += 1;
      return;
    case "change_pending":
      await deps.admin.markChangePending(row.id, row.carer_id, nowIso);
      await deps.notify?.adminChangePending(row.carer_id);
      summary.change_pending += 1;
      return;
    case "invalidated":
      await deps.admin.markInvalidated(row.id, row.carer_id, nowIso);
      await deps.notify?.adminInvalidated(row.carer_id);
      await deps.notify?.carerInvalidated(row.carer_id);
      summary.invalidated += 1;
      return;
  }
}
