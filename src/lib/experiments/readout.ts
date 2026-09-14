/**
 * Pure readout math for the /admin/experiments/[id] page (E3).
 *
 * Kept separate from the RSC so it's trivially unit-testable — the
 * server component just passes daily-rollup rows in and renders the
 * result.
 */

export type Variant = "control" | "treatment";

export type DailyRollup = {
  day: string;
  variant: Variant;
  n_offers: number;
  n_accepted: number;
  n_declined: number;
  n_expired: number;
};

export type ArmSummary = {
  n_offers: number;
  n_accepted: number;
  n_declined: number;
  n_expired: number;
  /** accept + declined + expired — the accept-rate denominator. */
  denominator: number;
  /** accepted / denominator; 0 when denominator == 0. */
  accept_rate: number;
};

export type DeltaSummary =
  | {
      available: true;
      /** treatment.accept_rate − control.accept_rate (signed). */
      value: number;
      ciLow: number;
      ciHigh: number;
    }
  | { available: false };

export type ExperimentReadout = {
  arms: Record<Variant, ArmSummary>;
  delta: DeltaSummary;
};

function emptyArm(): ArmSummary {
  return {
    n_offers: 0,
    n_accepted: 0,
    n_declined: 0,
    n_expired: 0,
    denominator: 0,
    accept_rate: 0,
  };
}

function sumArm(rows: DailyRollup[], variant: Variant): ArmSummary {
  const arm = emptyArm();
  for (const r of rows) {
    if (r.variant !== variant) continue;
    arm.n_offers += r.n_offers;
    arm.n_accepted += r.n_accepted;
    arm.n_declined += r.n_declined;
    arm.n_expired += r.n_expired;
  }
  arm.denominator = arm.n_accepted + arm.n_declined + arm.n_expired;
  arm.accept_rate = arm.denominator > 0 ? arm.n_accepted / arm.denominator : 0;
  return arm;
}

/**
 * Two-proportion Wald 95% CI for (pT − pC). Assumes independence,
 * large-enough-N normal approximation. We know it's not the tightest
 * interval; it's fine for the "sanity read" purpose. Uses z=1.96.
 */
function twoPropWaldCI(
  pC: number,
  nC: number,
  pT: number,
  nT: number,
): { low: number; high: number } {
  const varC = (pC * (1 - pC)) / Math.max(nC, 1);
  const varT = (pT * (1 - pT)) / Math.max(nT, 1);
  const se = Math.sqrt(varC + varT);
  const delta = pT - pC;
  const z = 1.96;
  return { low: delta - z * se, high: delta + z * se };
}

/**
 * Aggregate daily rows into per-arm summaries and a delta with CI.
 * Delta is only reported when both arms have a non-zero denominator.
 */
export function computeExperimentReadout(
  rows: DailyRollup[],
): ExperimentReadout {
  const control = sumArm(rows, "control");
  const treatment = sumArm(rows, "treatment");

  let delta: DeltaSummary;
  if (control.denominator > 0 && treatment.denominator > 0) {
    const ci = twoPropWaldCI(
      control.accept_rate,
      control.denominator,
      treatment.accept_rate,
      treatment.denominator,
    );
    delta = {
      available: true,
      value: treatment.accept_rate - control.accept_rate,
      ciLow: ci.low,
      ciHigh: ci.high,
    };
  } else {
    delta = { available: false };
  }

  return { arms: { control, treatment }, delta };
}
