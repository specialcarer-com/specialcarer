import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const REASON_MIN = 10;
const REASON_MAX = 500;

type Body = {
  proposed_start?: string;
  proposed_end?: string;
  reason?: string;
};

/**
 * POST /api/bookings/[id]/timesheet/adjust
 *
 * Either the carer, seeker, or an org member proposes a time correction
 * on a pending_approval timesheet. The opposite party confirms or rejects
 * via `/timesheet/adjust/[adjustment_id]/respond`. No change takes effect
 * until the opposite party approves; if no action by the approval
 * deadline, the original times stand.
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

  const startMs = Date.parse(String(body.proposed_start ?? ""));
  const endMs = Date.parse(String(body.proposed_end ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json(
      { error: "invalid_proposed_times" },
      { status: 400 },
    );
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return NextResponse.json(
      { error: `reason must be ${REASON_MIN}–${REASON_MAX} chars` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Identify role on the booking.
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

  let role: "carer" | "seeker" | "org_member" | null = null;
  if (booking.caregiver_id === user.id) role = "carer";
  else if (booking.seeker_id === user.id) role = "seeker";
  else if (booking.organization_id) {
    const { data: member } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", booking.organization_id)
      .eq("user_id", user.id)
      .maybeSingle<{ role: string }>();
    if (member && ["owner", "admin"].includes(member.role)) role = "org_member";
  }
  if (!role) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Timesheet must be pending_approval AND not already have a pending adjustment.
  const { data: ts } = await admin
    .from("shift_timesheets")
    .select("id, status, pending_adjustment_id")
    .eq("booking_id", bookingId)
    .maybeSingle<{
      id: string;
      status: string;
      pending_adjustment_id: string | null;
    }>();
  if (!ts) {
    return NextResponse.json({ error: "timesheet_not_found" }, { status: 404 });
  }
  if (ts.status !== "pending_approval") {
    return NextResponse.json(
      { error: `cannot_adjust_${ts.status}` },
      { status: 400 },
    );
  }
  if (ts.pending_adjustment_id) {
    return NextResponse.json(
      { error: "adjustment_already_pending" },
      { status: 409 },
    );
  }

  const proposedMinutes = Math.round((endMs - startMs) / 60000);
  const { data: inserted, error } = await admin
    .from("shift_time_adjustments")
    .insert({
      timesheet_id: ts.id,
      booking_id: bookingId,
      proposer_user_id: user.id,
      proposer_role: role,
      proposed_start: new Date(startMs).toISOString(),
      proposed_end: new Date(endMs).toISOString(),
      proposed_minutes: proposedMinutes,
      reason,
      status: "pending",
    })
    .select("id, proposed_start, proposed_end, proposed_minutes, reason")
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  await admin
    .from("shift_timesheets")
    .update({ pending_adjustment_id: inserted.id, updated_at: new Date().toISOString() })
    .eq("id", ts.id);

  // Notify the opposite party.
  try {
    const otherUserIds: string[] = [];
    if (role === "carer") {
      // Notify seeker or org members.
      if (booking.booking_source === "org" && booking.organization_id) {
        const { data: members } = await admin
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", booking.organization_id)
          .in("role", ["owner", "admin"]);
        for (const m of (members ?? []) as { user_id: string }[]) {
          otherUserIds.push(m.user_id);
        }
      } else if (booking.seeker_id) {
        otherUserIds.push(booking.seeker_id);
      }
    } else if (booking.caregiver_id) {
      otherUserIds.push(booking.caregiver_id);
    }
    if (otherUserIds.length > 0) {
      await admin.from("notifications").insert(
        otherUserIds.map((uid) => ({
          user_id: uid,
          kind: "timesheet_adjustment_proposed",
          title: "Time correction proposed",
          body: "Review the proposed times and approve or reject.",
          link_url:
            booking.booking_source === "org"
              ? `/m/org/bookings/${bookingId}`
              : `/m/bookings/${bookingId}`,
          payload: {
            booking_id: bookingId,
            timesheet_id: ts.id,
            adjustment_id: inserted.id,
          },
        })),
      );
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, adjustment: inserted });
}
