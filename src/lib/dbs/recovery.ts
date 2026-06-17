/**
 * DBS cost recovery (PR-DBS-1).
 *
 * SpecialCarers fronts the ~£60 DBS application cost and recovers it from the
 * carer's first earnings: 10% of each payout, with a £6 per-payout floor,
 * until the £60 total is recovered. Carers who pay upfront (recovery_status
 * 'paid_upfront') or are waived ('waived') are skipped.
 *
 * The pure computeRecovery() function below is the testable core. The
 * applyDbsRecovery() wrapper persists the result via the admin Supabase
 * client and is intended to be hooked into the Stripe Connect payout flow.
 * No live payout flow wires this yet — see the TODO at applyDbsRecovery for
 * PR-DBS-2.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isDbsEnabled } from "./flag";
import {
  DBS_RECOVERY_MIN_PENCE,
  DBS_RECOVERY_RATE,
  DBS_RECOVERY_TARGET_PENCE,
  DbsDisabledError,
  type DbsRecoveryStatus,
} from "./types";

export type RecoveryComputation = {
  deductedPence: number;
  newStatus: DbsRecoveryStatus;
  newCollectedPence: number;
};

/**
 * Pure recovery maths for a single payout. Exported for unit testing.
 *
 * @param payoutAmountPence  the carer's gross payout for this booking
 * @param currentStatus      the carer's current recovery_status
 * @param collectedPence     how much has already been recovered (0..6000)
 */
export function computeRecovery(
  payoutAmountPence: number,
  currentStatus: DbsRecoveryStatus,
  collectedPence: number,
): RecoveryComputation {
  // Only 'pending' and 'recovering' owe money. 'paid_upfront', 'waived',
  // and 'recovered' are terminal — never deduct.
  if (currentStatus !== "pending" && currentStatus !== "recovering") {
    return {
      deductedPence: 0,
      newStatus: currentStatus,
      newCollectedPence: collectedPence,
    };
  }

  const remaining = Math.max(0, DBS_RECOVERY_TARGET_PENCE - collectedPence);
  if (remaining === 0) {
    return {
      deductedPence: 0,
      newStatus: "recovered",
      newCollectedPence: collectedPence,
    };
  }

  // 10% of the payout, floored at £6, but never more than the payout itself
  // and never more than what's still owed.
  const tenPercent = Math.floor(payoutAmountPence * DBS_RECOVERY_RATE);
  const target = Math.max(tenPercent, DBS_RECOVERY_MIN_PENCE);
  const deductedPence = Math.max(
    0,
    Math.min(target, payoutAmountPence, remaining),
  );

  const newCollectedPence = collectedPence + deductedPence;
  const newStatus: DbsRecoveryStatus =
    newCollectedPence >= DBS_RECOVERY_TARGET_PENCE ? "recovered" : "recovering";

  return { deductedPence, newStatus, newCollectedPence };
}

export type ApplyRecoveryResult = {
  deductedPence: number;
  newStatus: DbsRecoveryStatus;
};

/**
 * Apply DBS recovery against a carer's payout and persist it.
 *
 * Recovery is tracked per (carer, kind) row but recovered as one £60 pot. We
 * deduct against the carer's oldest still-owing application row so the total
 * across all their rows converges on £60.
 *
 * TODO(PR-DBS-2): hook this into the live Stripe Connect payout flow so the
 * deductedPence is actually withheld from the transfer. Today it only records
 * the recovered amount against dbs_applications; the caller is responsible for
 * reducing the payout by the returned deductedPence.
 */
export async function applyDbsRecovery(
  carerId: string,
  payoutAmountPence: number,
): Promise<ApplyRecoveryResult> {
  if (!isDbsEnabled()) throw new DbsDisabledError();

  const admin = createAdminClient();

  // Oldest still-owing row for this carer.
  const { data: rows } = await admin
    .from("dbs_applications")
    .select("id, recovery_status, recovery_collected_pence")
    .eq("carer_id", carerId)
    .in("recovery_status", ["pending", "recovering"])
    .order("created_at", { ascending: true })
    .limit(1);

  const row = (rows ?? [])[0] as
    | { id: string; recovery_status: DbsRecoveryStatus; recovery_collected_pence: number | null }
    | undefined;
  if (!row) {
    return { deductedPence: 0, newStatus: "recovered" };
  }

  const result = computeRecovery(
    payoutAmountPence,
    row.recovery_status,
    row.recovery_collected_pence ?? 0,
  );

  if (result.deductedPence > 0 || result.newStatus !== row.recovery_status) {
    await admin
      .from("dbs_applications")
      .update({
        recovery_status: result.newStatus,
        recovery_collected_pence: result.newCollectedPence,
      })
      .eq("id", row.id);
  }

  return { deductedPence: result.deductedPence, newStatus: result.newStatus };
}
