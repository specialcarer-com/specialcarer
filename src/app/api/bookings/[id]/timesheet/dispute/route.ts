import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const REASON_MIN = 10;
const REASON_MAX = 500;

type Body = {
  reason?: string;
};

/**
 * POST /api/bookings/[id]/timesheet/dispute
 *
 * Seeker or org owner/admin opens a dispute on the timesheet. No Stripe
 * operations here — the original PaymentIntent's authorisation remains
 * intact while admin reviews. SLA: 72h.
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return NextResponse.json(
      { error: `reason must be ${REASON_MIN}–${REASON_MAX} chars` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id, organization_id, booking_source")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      caregiver_id: string | null;
      organization_id: string | null;
      booking_source: string;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }

  let authorised = false;
  if (booking.booking_source === "org") {
    if (booking.organization_id) {
      const { data: member } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", booking.organization_id)
        .eq("user_id", user.id)
        .maybeSingle<{ role: string }>();
      authorised = !!member && ["owner", "admin"].includes(member.role);
    }
  } else {
    authorised = booking.seeker_id === user.id;
  }
  if (!authorised) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: ts } = await admin
    .from("shift_timesheets")
    .select("id, carer_id, status")
    .eq("booking_id", bookingId)
    .maybeSingle<{
      id: string;
      carer_id: string;
      status: string;
    }>();
  if (!ts) {
    return NextResponse.json({ error: "timesheet_not_found" }, { status: 404 });
  }
  if (ts.status !== "pending_approval") {
    return NextResponse.json(
      { error: `cannot_dispute_${ts.status}` },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("shift_timesheets")
    .update({
      status: "disputed",
      dispute_reason: reason,
      dispute_opened_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", ts.id);

  // Flag the booking for admin review.
  await admin
    .from("bookings")
    .update({ flagged_for_review: true, updated_at: nowIso })
    .eq("id", bookingId);

  // Notify the carer + all admins (best-effort).
  try {
    await admin.from("notifications").insert({
      user_id: ts.carer_id,
      kind: "timesheet_disputed",
      title: "Timesheet disputed",
      body: "The family or organisation has opened a dispute. Our team will review within 72 hours.",
      link_url: `/m/active-job/${bookingId}`,
      payload: { booking_id: bookingId, timesheet_id: ts.id },
    });
  } catch {
    /* best-effort */
  }
  try {
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");
    const rows = ((admins ?? []) as { id: string }[]).map((a) => ({
      user_id: a.id,
      kind: "timesheet_dispute_admin",
      title: "Timesheet dispute opened",
      body: "Action required within 72 hours.",
      link_url: "/admin/timesheets",
      payload: { booking_id: bookingId, timesheet_id: ts.id },
    }));
    if (rows.length > 0) {
      await admin.from("notifications").insert(rows);
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, status: "disputed" });
}
