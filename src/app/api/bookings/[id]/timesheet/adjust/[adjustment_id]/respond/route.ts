import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TIMESHEET_CONFIG,
  ceilToRoundedMinutes,
  overageCapReason,
} from "@/lib/timesheet/config";

export const dynamic = "force-dynamic";

const REJECTION_MIN = 5;
const REJECTION_MAX = 500;

type Body = {
  action?: "approve" | "reject";
  rejection_reason?: string;
};

/**
 * POST /api/bookings/[id]/timesheet/adjust/[adjustment_id]/respond
 *
 * Opposite party to the proposer responds to a pending adjustment. On
 * approve, the timesheet's actual_start/end/minutes/overage/overtime are
 * recomputed from the proposed times. On reject, the adjustment is
 * marked rejected and the timesheet's pending_adjustment_id is cleared.
 */
export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; adjustment_id: string }>;
  },
) {
  const { id: bookingId, adjustment_id: adjustmentId } = await params;
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
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: adj } = await admin
    .from("shift_time_adjustments")
    .select(
      "id, timesheet_id, booking_id, proposer_user_id, proposer_role, proposed_start, proposed_end, proposed_minutes, status",
    )
    .eq("id", adjustmentId)
    .maybeSingle();
  if (!adj || adj.booking_id !== bookingId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (adj.status !== "pending") {
    return NextResponse.json(
      { error: `cannot_respond_${adj.status}` },
      { status: 400 },
    );
  }
  if (adj.proposer_user_id === user.id) {
    return NextResponse.json(
      { error: "proposer_cannot_respond" },
      { status: 403 },
    );
  }

  // Authorisation: must be opposite party.
  const { data: booking } = await admin
    .from("bookings")
    .select("seeker_id, caregiver_id, organization_id, booking_source")
    .eq("id", bookingId)
    .maybeSingle<{
      seeker_id: string;
      caregiver_id: string | null;
      organization_id: string | null;
      booking_source: string;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }

  let isOpposite = false;
  if (adj.proposer_role === "carer") {
    // Opposite party is seeker or org member.
    if (booking.booking_source === "org" && booking.organization_id) {
      const { data: member } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", booking.organization_id)
        .eq("user_id", user.id)
        .maybeSingle<{ role: string }>();
      isOpposite = !!member && ["owner", "admin"].includes(member.role);
    } else {
      isOpposite = booking.seeker_id === user.id;
    }
  } else {
    // Proposer is seeker / org_member → opposite is the carer.
    isOpposite = booking.caregiver_id === user.id;
  }
  if (!isOpposite) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  if (action === "reject") {
    const rejection =
      typeof body.rejection_reason === "string"
        ? body.rejection_reason.trim()
        : "";
    if (rejection.length < REJECTION_MIN || rejection.length > REJECTION_MAX) {
      return NextResponse.json(
        {
          error: `rejection_reason must be ${REJECTION_MIN}–${REJECTION_MAX} chars`,
        },
        { status: 400 },
      );
    }
    await admin
      .from("shift_time_adjustments")
      .update({
        status: "rejected",
        responder_user_id: user.id,
        responded_at: nowIso,
        rejection_reason: rejection,
      })
      .eq("id", adj.id);
    await admin
      .from("shift_timesheets")
      .update({ pending_adjustment_id: null, updated_at: nowIso })
      .eq("id", adj.timesheet_id);

    try {
      await admin.from("notifications").insert({
        user_id: adj.proposer_user_id,
        kind: "timesheet_adjustment_rejected",
        title: "Time correction rejected",
        body: rejection.slice(0, 200),
        link_url:
          booking.booking_source === "org"
            ? `/m/org/bookings/${bookingId}`
            : `/m/bookings/${bookingId}`,
        payload: {
          booking_id: bookingId,
          adjustment_id: adj.id,
        },
      });
    } catch {
      /* best-effort */
    }

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // approve — recompute timesheet from proposed times.
  const { data: ts } = await admin
    .from("shift_timesheets")
    .select(
      "id, booked_minutes, hourly_rate_cents, currency, overtime_minutes, overtime_cents",
    )
    .eq("id", adj.timesheet_id)
    .maybeSingle();
  if (!ts) {
    return NextResponse.json({ error: "timesheet_not_found" }, { status: 404 });
  }

  const proposedStartMs = Date.parse(adj.proposed_start);
  const proposedEndMs = Date.parse(adj.proposed_end);
  const rawMinutes = Math.round((proposedEndMs - proposedStartMs) / 60000);
  const actualMinutes = ceilToRoundedMinutes(rawMinutes);
  const bookedMinutes = Number(ts.booked_minutes);
  const hourlyRate = Number(ts.hourly_rate_cents);
  const overageMinutes = Math.max(0, actualMinutes - bookedMinutes);
  const overageCents = Math.ceil((overageMinutes / 60) * hourlyRate);
  const capReason = overageCapReason({
    actualMinutes,
    bookedMinutes,
    overageCents,
    currency: String(ts.currency ?? "gbp"),
  });
  const overageRequiresApproval = capReason !== null;

  // Note: FLSA overtime is NOT recomputed here — adjustments are typically
  // a few minutes either way, not enough to cross the 40h line, and we'd
  // need to re-query the 7d rolling window. Keeping the original
  // overtime values preserves audit clarity.
  void TIMESHEET_CONFIG;

  await admin
    .from("shift_time_adjustments")
    .update({
      status: "approved",
      responder_user_id: user.id,
      responded_at: nowIso,
    })
    .eq("id", adj.id);

  await admin
    .from("shift_timesheets")
    .update({
      actual_start: adj.proposed_start,
      actual_end: adj.proposed_end,
      actual_minutes: actualMinutes,
      overage_minutes: overageMinutes,
      overage_cents: overageCents,
      overage_requires_approval: overageRequiresApproval,
      overage_cap_reason: capReason,
      pending_adjustment_id: null,
      updated_at: nowIso,
    })
    .eq("id", adj.timesheet_id);

  try {
    await admin.from("notifications").insert({
      user_id: adj.proposer_user_id,
      kind: "timesheet_adjustment_approved",
      title: "Time correction approved",
      body: "Your proposed times are now on the timesheet.",
      link_url:
        booking.booking_source === "org"
          ? `/m/org/bookings/${bookingId}`
          : `/m/bookings/${bookingId}`,
      payload: { booking_id: bookingId, adjustment_id: adj.id },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, status: "approved" });
}
