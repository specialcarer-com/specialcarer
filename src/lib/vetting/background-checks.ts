/**
 * Interpret a row of the `caregiver_verification` view.
 *
 * The view exposes `uk_fully_cleared` and `us_fully_cleared` (null when the
 * carer has no checks of that kind yet). It has no `gb_*` or generic
 * `fully_cleared` column, so selecting those makes the whole query fail.
 */
export type CaregiverVerificationRow = {
  country: string | null;
  uk_fully_cleared: boolean | null;
  us_fully_cleared: boolean | null;
};

export const CAREGIVER_VERIFICATION_COLUMNS =
  "user_id, country, uk_fully_cleared, us_fully_cleared";

export function backgroundChecksCompleteFrom(
  row: CaregiverVerificationRow | null | undefined,
): boolean {
  if (!row) return false;
  if (row.country === "US") return row.us_fully_cleared === true;
  return row.uk_fully_cleared === true;
}
