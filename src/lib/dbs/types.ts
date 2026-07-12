/**
 * Shared DBS domain types for the PR-DBS-1 application/recovery model.
 *
 * Distinct from src/lib/dbs/provider.ts, which models the Update Service
 * *verification* path (checking an existing certificate). This file models
 * the *application* path (SC applies for a fresh DBS on the carer's behalf).
 * PR-DBS-2 reconciles the two against the live uCheck + Update Service APIs.
 */

export type DbsKind = "adult" | "child";

export type DbsStatus =
  | "not_started"
  | "submitted"
  | "in_progress"
  | "approved"
  | "rejected"
  | "expired";

export type DbsOverallStatus =
  | "not_started"
  | "in_progress"
  | "approved"
  | "rejected"
  | "expired";

export type DbsRecoveryStatus =
  | "pending"
  | "recovering"
  | "recovered"
  | "paid_upfront"
  | "waived";

/** Carer detail payload sent to the vendor when submitting an application. */
export type DbsCarerDetails = {
  legalName: string;
  dateOfBirth: string; // ISO date (YYYY-MM-DD)
  surname: string;
  addressLine1?: string;
  postcode?: string;
};

/** The £60 application cost SC fronts, in pence. */
export const DBS_COST_PENCE = 6000;

/** Recovery rate: 10% of each payout. */
export const DBS_RECOVERY_RATE = 0.1;

/** Minimum recovered per booking/payout, in pence (£6). */
export const DBS_RECOVERY_MIN_PENCE = 600;

/** Total to recover per carer across all applications, in pence (£60). */
export const DBS_RECOVERY_TARGET_PENCE = 6000;

/** Thrown by every DBS write path when NEXT_PUBLIC_DBS_ENABLED is off. */
export class DbsDisabledError extends Error {
  constructor(message = "DBS feature is disabled (NEXT_PUBLIC_DBS_ENABLED is off)") {
    super(message);
    this.name = "DbsDisabledError";
  }
}
