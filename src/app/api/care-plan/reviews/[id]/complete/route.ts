/**
 * POST /api/care-plan/reviews/[id]/complete
 *
 * Mark a Reg-9 review completed and schedule the next one. Access:
 *   - Seeker on the parent care_plan's booking, OR
 *   - Admin.
 *
 * Feature-flagged by NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED. When off
 * the route returns 404 so the surface is bit-identically absent.
 *
 * Body (all optional):
 *   { reviewerNotes?: string; nextCadenceMonths?: 3|6|12 }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReg9ReviewCadenceEnabled } from "@/lib/care-plan/flag";
import { completeReview } from "@/lib/care-plan/reviews-server";
import type { ReviewCadenceMonths } from "@/lib/care-plan/reviews";
import { REVIEW_CADENCE_MONTHS } from "@/lib/care-plan/reviews";

export const dynamic = "force-dynamic";

type Body = {
  reviewerNotes?: unknown;
  nextCadenceMonths?: unknown;
};

function parseCadence(input: unknown): ReviewCadenceMonths | undefined {
  if (typeof input !== "number") return undefined;
  return (REVIEW_CADENCE_MONTHS as ReadonlyArray<number>).includes(input)
    ? (input as ReviewCadenceMonths)
    : undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isReg9ReviewCadenceEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Authorisation: seeker on booking OR admin. RLS on care_plan_reviews
  // grants read to those two roles plus carer; we further require the
  // caller to be seeker or admin for writes.
  const admin = createAdminClient();
  const { data: reviewRow, error: reviewErr } = await admin
    .from("care_plan_reviews")
    .select("id, care_plan_id")
    .eq("id", id)
    .maybeSingle();
  if (reviewErr || !reviewRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: planRow } = await admin
    .from("care_plans")
    .select("id, booking_id")
    .eq("id", reviewRow.care_plan_id)
    .maybeSingle();
  if (!planRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id, seeker_id")
    .eq("id", planRow.booking_id)
    .maybeSingle();
  if (!bookingRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isSeeker = bookingRow.seeker_id === user.id;
  const { data: profileRow } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profileRow?.role === "admin";
  if (!isSeeker && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const reviewerNotes =
    typeof body.reviewerNotes === "string" ? body.reviewerNotes : null;
  const nextCadenceMonths = parseCadence(body.nextCadenceMonths);

  const result = await completeReview(id, user.id, {
    reviewerNotes,
    nextCadenceMonths,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    completed: result.completed,
    next: result.next,
  });
}
