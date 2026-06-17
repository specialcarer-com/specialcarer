import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { US_REGION_ENABLED } from "@/lib/region";

export const dynamic = "force-dynamic";

/**
 * One completed-but-unreviewed booking, ready for the Review hub list.
 */
export type ApiPendingReviewItem = {
  booking_id: string;
  caregiver_id: string | null;
  caregiver_name: string | null;
  caregiver_avatar: string | null;
  service_type: string;
  starts_at: string;
  ends_at: string;
  completed_at: string;
};

/**
 * One review the seeker has already written, for the read-only "your past
 * reviews" list (with an edit affordance back into the form).
 */
export type ApiWrittenReviewItem = {
  booking_id: string;
  caregiver_id: string | null;
  caregiver_name: string | null;
  caregiver_avatar: string | null;
  rating: number;
  body: string | null;
  created_at: string;
};

export type ApiReviewHubResponse = {
  pending: ApiPendingReviewItem[];
  written: ApiWrittenReviewItem[];
};

type BookingRow = {
  id: string;
  caregiver_id: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  service_type: string | null;
  shift_completed_at: string | null;
  created_at: string;
};

type ReviewRow = {
  booking_id: string;
  caregiver_id: string | null;
  rating: number | null;
  body: string | null;
  created_at: string;
};

/**
 * GET /api/m/reviews/pending
 *
 * Returns, for the signed-in seeker:
 *   - `pending`: completed/paid_out bookings with no review row yet, newest
 *     first — these are what the hub prompts the seeker to review.
 *   - `written`: reviews the seeker has already submitted, newest first —
 *     shown read-only with an edit affordance.
 *
 * Reviewing is seeker-only (mirrors POST /api/bookings/[id]/review and the
 * /m/review middleware gate), so we only look at the seeker side of bookings.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: bookingRows, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, caregiver_id, status, starts_at, ends_at, service_type, shift_completed_at, created_at",
    )
    .eq("seeker_id", user.id)
    .in("status", ["completed", "paid_out"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }
  const bookings = (bookingRows ?? []) as BookingRow[];

  // Reviews this seeker has authored (one per booking_id+reviewer_id).
  const { data: reviewRows, error: rErr } = await supabase
    .from("reviews")
    .select("booking_id, caregiver_id, rating, body, created_at")
    .eq("reviewer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }
  const reviews = (reviewRows ?? []) as ReviewRow[];
  const reviewedBookingIds = new Set(reviews.map((r) => r.booking_id));

  // Resolve carer display info for every carer referenced by either list.
  const carerIds = Array.from(
    new Set(
      [
        ...bookings.map((b) => b.caregiver_id),
        ...reviews.map((r) => r.caregiver_id),
      ].filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const carerName = new Map<string, string | null>();
  const carerAvatar = new Map<string, string | null>();
  if (carerIds.length > 0) {
    // UK-only regional scoping: caregiver_profiles must be filtered to GB
    // unless the US launch flag is on. Carers filtered out by the country
    // gate simply fall back to profiles.full_name / avatar_url below.
    let carersQuery = supabase
      .from("caregiver_profiles")
      .select("user_id, display_name, photo_url")
      .in("user_id", carerIds);
    if (!US_REGION_ENABLED) carersQuery = carersQuery.eq("country", "GB");
    const [{ data: carers }, { data: profs }] = await Promise.all([
      carersQuery,
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", carerIds),
    ]);
    for (const c of (carers ?? []) as {
      user_id: string;
      display_name: string | null;
      photo_url: string | null;
    }[]) {
      if (c.display_name) carerName.set(c.user_id, c.display_name);
      if (c.photo_url) carerAvatar.set(c.user_id, c.photo_url);
    }
    for (const p of (profs ?? []) as {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    }[]) {
      if (!carerName.get(p.id)) carerName.set(p.id, p.full_name);
      if (!carerAvatar.get(p.id)) carerAvatar.set(p.id, p.avatar_url);
    }
  }

  const pending: ApiPendingReviewItem[] = bookings
    .filter((b) => !reviewedBookingIds.has(b.id))
    .map((b) => ({
      booking_id: b.id,
      caregiver_id: b.caregiver_id,
      caregiver_name: b.caregiver_id
        ? carerName.get(b.caregiver_id) ?? null
        : null,
      caregiver_avatar: b.caregiver_id
        ? carerAvatar.get(b.caregiver_id) ?? null
        : null,
      service_type: b.service_type ?? "",
      starts_at: b.starts_at ?? "",
      ends_at: b.ends_at ?? "",
      completed_at: b.shift_completed_at ?? b.created_at,
    }));

  const written: ApiWrittenReviewItem[] = reviews.map((r) => ({
    booking_id: r.booking_id,
    caregiver_id: r.caregiver_id,
    caregiver_name: r.caregiver_id
      ? carerName.get(r.caregiver_id) ?? null
      : null,
    caregiver_avatar: r.caregiver_id
      ? carerAvatar.get(r.caregiver_id) ?? null
      : null,
    rating: Number(r.rating ?? 0),
    body: r.body,
    created_at: r.created_at,
  }));

  const response: ApiReviewHubResponse = { pending, written };
  return NextResponse.json(response);
}
