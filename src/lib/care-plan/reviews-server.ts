/**
 * Server-side data helpers for care-plan reviews.
 *
 * Reads run through the user-scoped SSR client (RLS enforced).
 * Writes and cron work run through the admin client (RLS bypassed —
 * the callers are responsible for authorisation).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeNextReviewDate,
  type CarePlanReviewRow,
  type ReviewCadenceMonths,
} from "./reviews";

export const REVIEW_ROW_COLUMNS =
  "id, care_plan_id, scheduled_for, status, completed_at, completed_by, " +
  "reviewer_notes, next_review_due, cadence_months, event_trigger, " +
  "last_reminded_at, created_at, updated_at";

/**
 * List the reviews the caller can see (RLS: seeker on booking, carer on
 * booking, or admin). Filtered to a status set the caller cares about.
 */
export async function listReviewsForCaller(
  statuses: ReadonlyArray<CarePlanReviewRow["status"]> = [
    "due",
    "in_progress",
    "overdue",
  ],
): Promise<CarePlanReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_plan_reviews")
    .select(REVIEW_ROW_COLUMNS)
    .in("status", [...statuses])
    .order("scheduled_for", { ascending: true });
  if (error) {
    console.error("[reviews] list failed", error);
    return [];
  }
  return ((data ?? []) as unknown) as CarePlanReviewRow[];
}

/**
 * Fetch a single review by id under RLS (returns null if the caller
 * can't see it).
 */
export async function getReviewForCaller(
  id: string,
): Promise<CarePlanReviewRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_plan_reviews")
    .select(REVIEW_ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[reviews] get failed", error);
    return null;
  }
  return ((data ?? null) as unknown) as CarePlanReviewRow | null;
}

export type CompleteReviewInput = {
  reviewerNotes?: string | null;
  /** Optional cadence override — defaults to the current row's cadence. */
  nextCadenceMonths?: ReviewCadenceMonths;
};

export type CompleteReviewResult =
  | { ok: true; completed: CarePlanReviewRow; next: CarePlanReviewRow }
  | { ok: false; error: string };

/**
 * Mark a review completed and insert the next scheduled review row.
 * Runs with the service-role client (bypasses RLS); the caller is
 * responsible for having authorised the actor (seeker on booking OR
 * admin) — see /api/care-plan/reviews/[id]/complete route.
 */
export async function completeReview(
  reviewId: string,
  actorId: string,
  input: CompleteReviewInput = {},
): Promise<CompleteReviewResult> {
  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("care_plan_reviews")
    .select(REVIEW_ROW_COLUMNS)
    .eq("id", reviewId)
    .maybeSingle();
  if (fetchErr || !existing) {
    return { ok: false, error: fetchErr?.message ?? "Review not found" };
  }
  const current = (existing as unknown) as CarePlanReviewRow;
  if (current.status === "completed") {
    return { ok: false, error: "Review already completed" };
  }

  const now = new Date();
  const cadence: ReviewCadenceMonths =
    input.nextCadenceMonths ?? current.cadence_months;
  const nextDate = computeNextReviewDate(now, cadence);
  const nextYmd = nextDate.toISOString().slice(0, 10);

  const notes =
    typeof input.reviewerNotes === "string"
      ? input.reviewerNotes.slice(0, 4000)
      : null;

  const { data: completedRow, error: updateErr } = await admin
    .from("care_plan_reviews")
    .update({
      status: "completed",
      completed_at: now.toISOString(),
      completed_by: actorId,
      reviewer_notes: notes,
      next_review_due: nextYmd,
      updated_at: now.toISOString(),
    })
    .eq("id", reviewId)
    .select(REVIEW_ROW_COLUMNS)
    .single();
  if (updateErr || !completedRow) {
    return {
      ok: false,
      error: updateErr?.message ?? "Could not complete review",
    };
  }

  const { data: nextRow, error: insertErr } = await admin
    .from("care_plan_reviews")
    .insert({
      care_plan_id: current.care_plan_id,
      scheduled_for: nextYmd,
      cadence_months: cadence,
      status: "due",
    })
    .select(REVIEW_ROW_COLUMNS)
    .single();
  if (insertErr || !nextRow) {
    return {
      ok: false,
      error: insertErr?.message ?? "Could not schedule next review",
    };
  }

  return {
    ok: true,
    completed: (completedRow as unknown) as CarePlanReviewRow,
    next: (nextRow as unknown) as CarePlanReviewRow,
  };
}
