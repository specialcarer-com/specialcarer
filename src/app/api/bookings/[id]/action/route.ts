import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { unredeemCreditsForBooking } from "@/lib/referrals/redemption";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings/[id]/action  { action: "cancel" | "decline" | "start" }
 *
 * - cancel  : seeker cancels (any pre-shift state). If paid, refund.
 * - decline : caregiver declines a pending/accepted booking. If paid, refund.
 * - start   : caregiver marks a paid booking as in_progress (when they arrive).
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

  const payload = (await req.json().catch(() => ({}))) as {
    action?: string;
    handoff_notes?: string;
  };
  const action = payload.action;
  if (
    !["cancel", "decline", "start", "accept", "complete"].includes(
      action ?? "",
    )
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const isSeeker = booking.seeker_id === user.id;
  const isCaregiver = booking.caregiver_id === user.id;
  if (!isSeeker && !isCaregiver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "cancel" || action === "decline") {
    if (action === "cancel" && !isSeeker) {
      return NextResponse.json({ error: "Only seeker can cancel" }, { status: 403 });
    }
    if (action === "decline" && !isCaregiver) {
      return NextResponse.json({ error: "Only caregiver can decline" }, { status: 403 });
    }
    if (!["pending", "accepted", "paid"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot ${action} a booking in status ${booking.status}` },
        { status: 400 },
      );
    }

    // Track when the carer declined for the response-time metric.
    const isDeclineByCarer = action === "decline" && isCaregiver;

    // If paid (manual capture authorized), cancel the PaymentIntent to release the hold
    if (booking.status === "paid" || booking.paid_at) {
      const { data: payment } = await admin
        .from("payments")
        .select("stripe_payment_intent_id, status")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (payment?.stripe_payment_intent_id) {
        try {
          await stripe.paymentIntents.cancel(payment.stripe_payment_intent_id);
          await admin
            .from("payments")
            .update({ status: "cancelled" })
            .eq("booking_id", bookingId);
        } catch (err) {
          console.error("PI cancel failed", err);
        }
      }
    }

    const now = new Date().toISOString();
    await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: now,
        // Only stamp declined_at on a carer-initiated decline
        // (not on a seeker cancel) — drives the response-time metric.
        ...(isDeclineByCarer && !booking.declined_at
          ? { declined_at: now }
          : {}),
        updated_at: now,
      })
      .eq("id", bookingId);

    // Un-redeem any referral credit applied to this booking. Idempotent —
    // safe to call even when nothing was applied. Expired credits are
    // intentionally left spent.
    try {
      await unredeemCreditsForBooking({ supabase: admin, bookingId });
    } catch (err) {
      console.error("[booking.cancel] unredeem failed", err);
    }

    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (action === "accept") {
    if (!isCaregiver) {
      return NextResponse.json(
        { error: "Only the assigned caregiver can accept" },
        { status: 403 },
      );
    }
    if (booking.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot accept a booking in status ${booking.status}` },
        { status: 400 },
      );
    }
    if (
      booking.discovery_expires_at &&
      new Date(booking.discovery_expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "This job has expired" },
        { status: 400 },
      );
    }
    const acceptedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("bookings")
      .update({
        status: "accepted",
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq("id", bookingId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  if (action === "start") {
    if (!isCaregiver) {
      return NextResponse.json(
        { error: "Only caregiver can start a shift" },
        { status: 403 },
      );
    }
    if (!["paid", "accepted"].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot start a booking in status ${booking.status}` },
        { status: 400 },
      );
    }
    const startNow = new Date().toISOString();
    await admin
      .from("bookings")
      .update({
        status: "in_progress",
        // Capture true arrival time for the on-time metric. Only sets
        // on the first start to keep the value honest if the shift
        // is paused/resumed in future.
        ...(booking.actual_started_at
          ? {}
          : { actual_started_at: startNow }),
        updated_at: startNow,
      })
      .eq("id", bookingId);
    return NextResponse.json({ ok: true, status: "in_progress" });
  }

  if (action === "complete") {
    if (!isCaregiver) {
      return NextResponse.json(
        { error: "Only the caregiver can check out a shift" },
        { status: 403 },
      );
    }
    if (booking.status !== "in_progress") {
      return NextResponse.json(
        { error: `Cannot complete a booking in status ${booking.status}` },
        { status: 400 },
      );
    }
    const handoff =
      typeof payload.handoff_notes === "string"
        ? payload.handoff_notes.trim().slice(0, 4000)
        : null;
    const completedAt = new Date().toISOString();
    const payoutEligibleAt = new Date(
      Date.now() + 24 * 3600 * 1000,
    ).toISOString();
    const { error: updErr } = await admin
      .from("bookings")
      .update({
        status: "completed",
        shift_completed_at: completedAt,
        checked_out_at: completedAt,
        handoff_notes: handoff || null,
        payout_eligible_at: payoutEligibleAt,
        updated_at: completedAt,
      })
      .eq("id", bookingId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Drop a system journal event "{Carer} checked out at HH:MM".
    try {
      const { recordSystemEventOnce } = await import(
        "@/lib/journal/system-events"
      );
      const { data: prof } = await admin
        .from("caregiver_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle<{ display_name: string | null }>();
      await recordSystemEventOnce(admin, {
        bookingId,
        kind: "departure",
        actorName: prof?.display_name ?? null,
        authorId: user.id,
      });
    } catch (e) {
      console.error("[action.complete] journal event failed", e);
    }

    // Referral progress: if this carer was referred, bump their
    // referee row by 1 and flip to 'qualified' once they hit the
    // qualifying-bookings threshold. Idempotent enough — we only
    // increment for completed status transitions, which only fire
    // here.
    try {
      const { data: ref } = await admin
        .from("referrals")
        .select("id, qualifying_bookings, payout_status")
        .eq("referee_id", user.id)
        .maybeSingle<{
          id: string;
          qualifying_bookings: number;
          payout_status: string;
        }>();
      if (ref && ref.payout_status === "pending") {
        const next = ref.qualifying_bookings + 1;
        const status = next >= 5 ? "qualified" : "pending";
        await admin
          .from("referrals")
          .update({ qualifying_bookings: next, payout_status: status })
          .eq("id", ref.id);
      }
    } catch (e) {
      console.error("[action.complete] referral bump failed", e);
    }

    // ── Timesheet generation (Phase 1: approval/overage layer) ──────────────
    // Compute actual_minutes / booked_minutes / overage / FLSA overtime
    // and insert the shift_timesheets row. Idempotent: re-running this
    // action returns the existing row instead of double-inserting.
    let timesheet: Awaited<
      ReturnType<typeof import("@/lib/timesheet/generate").generateTimesheetOnComplete>
    > = null;
    try {
      const bookingSource: "seeker" | "org" =
        booking.booking_source === "org" ? "org" : "seeker";
      const { generateTimesheetOnComplete } = await import(
        "@/lib/timesheet/generate"
      );
      timesheet = await generateTimesheetOnComplete(admin, {
        bookingId,
        caregiverId: user.id,
        seekerId: booking.seeker_id,
        bookingSource,
        actualStartIso: booking.actual_started_at ?? completedAt,
        actualEndIso: completedAt,
        bookedStartIso: booking.starts_at,
        bookedEndIso: booking.ends_at,
        hourlyRateCents: Number(booking.hourly_rate_cents ?? 0),
        currency: String(booking.currency ?? "gbp"),
        forcedCheckIn: booking.check_in_forced === true,
        forcedCheckOut: booking.check_out_forced === true,
      });

      // Org bookings: mint the Stripe Invoice in DRAFT state now so the
      // /api/cron/finalise-org-invoices cron can append overage line items
      // once the 48h approval window closes. Existing immediate-finalise
      // callers are untouched (default opts.finaliseImmediately=true).
      if (bookingSource === "org" && timesheet) {
        try {
          const { createShiftInvoice } = await import("@/lib/stripe/invoicing");
          await createShiftInvoice(
            admin,
            booking as unknown as import("@/lib/org/booking-types").OrgBooking,
            14,
            {
              finaliseImmediately: false,
              finaliseAfter: new Date(timesheet.autoApproveAt),
            },
          );
        } catch (e) {
          console.error("[action.complete] draft org invoice failed", e);
        }
      }
    } catch (e) {
      console.error("[action.complete] timesheet generation failed", e);
    }

    return NextResponse.json({
      ok: true,
      status: "completed",
      timesheet: timesheet
        ? {
            id: timesheet.id,
            auto_approve_at: timesheet.autoApproveAt,
            overage_minutes: timesheet.overageMinutes,
            overage_cents: timesheet.overageCents,
            overage_requires_approval: timesheet.overageRequiresApproval,
            overtime_minutes: timesheet.overtimeMinutes,
            overtime_cents: timesheet.overtimeCents,
          }
        : null,
    });
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
}
