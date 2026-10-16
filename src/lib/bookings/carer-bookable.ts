/**
 * A carer can only be booked while their profile is published. Unpublished
 * carers (not yet verified, paused, or demo/test accounts) are hidden from
 * search, and this stops a direct link or a stale page from starting a booking.
 */
export type CarerBookableRow = { is_published: boolean | null } | null | undefined;

export const CARER_UNAVAILABLE_MESSAGE =
  "This carer isn't available for booking right now. Please choose another carer.";

/** Returns null when the carer can be booked, otherwise the API error body. */
export function carerBookableError(
  row: CarerBookableRow,
): { error: string; reason: "carer_unpublished" } | null {
  if (row?.is_published === true) return null;
  return { error: CARER_UNAVAILABLE_MESSAGE, reason: "carer_unpublished" };
}
