import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CATEGORY_KEYS,
  MAX_PRIVATE_FEEDBACK,
  MAX_PUBLIC_BODY,
  MAX_TAGS,
  REVIEW_TAG_KEYS,
  type CategoryKey,
} from "@/lib/reviews/types";

export const dynamic = "force-dynamic";

type ReviewBody = {
  rating?: number;
  body?: string;
  rating_punctuality?: number;
  rating_communication?: number;
  rating_care_quality?: number;
  rating_cleanliness?: number;
  tags?: unknown;
  private_feedback?: string;
};

function isValidRating(n: unknown, allowOptional = false): boolean {
  if (allowOptional && (n === undefined || n === null)) return true;
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
}

const CATEGORY_TO_COLUMN: Record<CategoryKey, string> = {
  punctuality: "rating_punctuality",
  communication: "rating_communication",
  care_quality: "rating_care_quality",
  cleanliness: "rating_cleanliness",
};

/**
 * POST /api/bookings/[id]/review
 *   {
 *     rating: 1..5,                    // overall, required
 *     body?: string (≤2000),           // public review body
 *     rating_punctuality?: 1..5,       // optional category sub-ratings
 *     rating_communication?: 1..5,
 *     rating_care_quality?: 1..5,
 *     rating_cleanliness?: 1..5,
 *     tags?: string[] (≤5, from REVIEW_TAG_OPTIONS),
 *     private_feedback?: string (≤2000) // separately stored, never public
 *   }
 *
 * Only the seeker of a completed/paid_out booking can review. One row
 * per booking_id+reviewer_id (upsert).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: ReviewBody;
  try {
    payload = (await req.json()) as ReviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rating, body, tags, private_feedback } = payload;

  if (!isValidRating(rating)) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }
  if (
    body !== undefined &&
    (typeof body !== "string" || body.length > MAX_PUBLIC_BODY)
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  for (const v of [
    payload.rating_punctuality,
    payload.rating_communication,
    payload.rating_care_quality,
    payload.rating_cleanliness,
  ]) {
    if (!isValidRating(v, true)) {
      return NextResponse.json(
        { error: "Category ratings must be 1–5" },
        { status: 400 },
      );
    }
  }

  let cleanTags: string[] = [];
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { error: "tags must be an array" },
        { status: 400 },
      );
    }
    if (tags.length > MAX_TAGS) {
      return NextResponse.json(
        { error: `Up to ${MAX_TAGS} tags` },
        { status: 400 },
      );
    }
    for (const t of tags) {
      if (typeof t !== "string" || !REVIEW_TAG_KEYS.has(t)) {
        return NextResponse.json(
          { error: `Unknown tag: ${String(t)}` },
          { status: 400 },
        );
      }
    }
    cleanTags = Array.from(new Set(tags as string[]));
  }

  if (
    private_feedback !== undefined &&
    (typeof private_feedback !== "string" ||
      private_feedback.length > MAX_PRIVATE_FEEDBACK)
  ) {
    return NextResponse.json(
      { error: "Private feedback too long" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("seeker_id, caregiver_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json(
      { error: "Only the seeker can review" },
      { status: 403 },
    );
  }
  if (!["completed", "paid_out"].includes(booking.status)) {
    return NextResponse.json(
      { error: "Reviews open after the shift completes" },
      { status: 400 },
    );
  }

  // Upsert the public review row via the user-scoped client so RLS
  // continues to enforce reviewer_id = auth.uid().
  const reviewRow: Record<string, unknown> = {
    booking_id: bookingId,
    reviewer_id: user.id,
    caregiver_id: booking.caregiver_id,
    rating: rating as number,
    body: body?.trim() || null,
    tags: cleanTags,
  };
  for (const key of CATEGORY_KEYS) {
    const v = payload[`rating_${key}` as keyof ReviewBody];
    if (typeof v === "number") {
      reviewRow[CATEGORY_TO_COLUMN[key]] = v;
    }
  }

  const { error } = await supabase
    .from("reviews")
    .upsert(reviewRow, { onConflict: "booking_id,reviewer_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Private feedback lives in its own table so it can't leak through
  // the public reviews row even if a query is misshaped.
  if (private_feedback && private_feedback.trim().length > 0) {
    const { error: pfErr } = await supabase
      .from("review_private_feedback")
      .upsert(
        {
          booking_id: bookingId,
          reviewer_id: user.id,
          caregiver_id: booking.caregiver_id,
          body: private_feedback.trim(),
        },
        { onConflict: "booking_id,reviewer_id" },
      );
    if (pfErr) {
      // Public review is already saved — surface the partial failure
      // but don't roll back; the seeker can retry private feedback.
      return NextResponse.json(
        { ok: true, warning: "private_feedback_failed" },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
