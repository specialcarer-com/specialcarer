/**
 * Presentation logic for the seeker Review hub (PR-R4, /m/review).
 *
 * Kept framework-free so the sort/empty-state/validation rules can be unit
 * tested without rendering React. The page component imports these helpers.
 */

export type PendingReview = {
  booking_id: string;
  caregiver_name: string | null;
  completed_at: string;
};

export type WrittenReview = {
  booking_id: string;
  caregiver_name: string | null;
  rating: number;
  body: string | null;
  created_at: string;
};

/** Free-text review body cap (chars). Shown via a live counter in the form. */
export const REVIEW_BODY_LIMIT = 500;

/** Newest-first by completion date. Stable for equal timestamps. */
export function sortPendingNewestFirst<T extends { completed_at: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
  );
}

/** Newest-first by creation date. */
export function sortWrittenNewestFirst<T extends { created_at: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** The hub shows its empty state when there is nothing left to review. */
export function isHubEmpty(pending: readonly unknown[]): boolean {
  return pending.length === 0;
}

export type ReviewFormError = "rating" | "body" | null;

/**
 * Validates a review form submission. Rating must be an integer 1–5; body is
 * optional but capped at REVIEW_BODY_LIMIT. Returns the first error, or null
 * when the form is valid.
 */
export function validateReviewForm(input: {
  rating: number;
  body: string;
}): ReviewFormError {
  if (
    !Number.isInteger(input.rating) ||
    input.rating < 1 ||
    input.rating > 5
  ) {
    return "rating";
  }
  if (input.body.length > REVIEW_BODY_LIMIT) {
    return "body";
  }
  return null;
}
