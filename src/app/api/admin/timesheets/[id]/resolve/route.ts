import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { approveTimesheet } from "@/lib/timesheet/approve";
import {
  ceilToRoundedMinutes,
  overageCapReason,
} from "@/lib/timesheet/config";

export const dynamic = "force-dynamic";

const NOTES_MIN = 5;
const NOTES_MAX = 2000;

type Resolution = "accept_carer" | "accept_seeker" | "partial";

type Body = {
  resolution?: Resolution;
  override_actual_minutes?: number;
  admin_notes?: string;
};

/**
 * POST /api/admin/timesheets/[id]/resolve
 *
 * Admin closes out a disputed timesheet. Three resolutions:
 *
 *   accept_carer  — capture per the timesheet as carer reported (acts like approve)
 *   accept_seeker — capture only the booked amount, cancel/release the rest of
 *                   the primary auth hold; supplemental PIs are not minted
 *   partial       — admin overrides actual_minutes (required); overage/overtime
 *                   recompute; acts like approve afterwards
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: timesheetId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const resolution = body.resolution;
  if (
    resolution !== "accept_carer" &&
    resolution !== "accept_seeker" &&
    resolution !== "partial"
  ) {
    return NextResponse.json({ error: "invalid_resolution" }, { status: 400 });
  }
  const notes = typeof body.admin_notes === "string" ? body.admin_notes.trim() : "";
  if (notes.length < NOTES_MIN || notes.length > NOTES_MAX) {
    return NextResponse.json(
      { error: `admin_notes must be ${NOTES_MIN}–${NOTES_MAX} chars` },
      { status: 400 },
    );
  }

  const { data: ts } = await admin
    .from("shift_timesheets")
    .select(
      "id, booking_id, booking_source, status, currency, hourly_rate_cents, booked_minutes, actual_start, actual_end, actual_minutes, carer_id",
    )
    .eq("id", timesheetId)
    .maybeSingle();
  if (!ts) {
    return NextResponse.json({ error: "timesheet_not_found" }, { status: 404 });
  }

  // Admin can resolve disputed OR overage-pending-too-long timesheets.
  if (!["disputed", "pending_approval"].includes(ts.status)) {
    return NextResponse.json(
      { error: `cannot_resolve_${ts.status}` },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  // Apply partial override BEFORE running approval flow.
  if (resolution === "partial") {
    const override = Number(body.override_actual_minutes);
    if (!Number.isFinite(override) || override <= 0) {
      return NextResponse.json(
        { error: "override_actual_minutes required for partial resolution" },
        { status: 400 },
      );
    }
    const newActualMinutes = ceilToRoundedMinutes(override);
    const overageMinutes = Math.max(0, newActualMinutes - Number(ts.booked_minutes));
    const overageCents = Math.ceil(
      (overageMinutes / 60) * Number(ts.hourly_rate_cents),
    );
    const capReason = overageCapReason({
      actualMinutes: newActualMinutes,
      bookedMinutes: Number(ts.booked_minutes),
      overageCents,
      currency: String(ts.currency ?? "gbp"),
    });
    // Adjust the actual_end timestamp to match the new minutes.
    const startMs = Date.parse(String(ts.actual_start));
    const newEndIso = new Date(startMs + newActualMinutes * 60000).toISOString();
    await admin
      .from("shift_timesheets")
      .update({
        actual_end: newEndIso,
        actual_minutes: newActualMinutes,
        overage_minutes: overageMinutes,
        overage_cents: overageCents,
        overage_requires_approval: capReason !== null,
        overage_cap_reason: capReason,
        updated_at: nowIso,
      })
      .eq("id", ts.id);
  }

  // Stamp dispute resolution metadata regardless of branch.
  await admin
    .from("shift_timesheets")
    .update({
      dispute_resolution: resolution,
      dispute_admin_notes: notes,
      dispute_resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", ts.id);

  // For accept_seeker: cancel the primary PI's overage portion and mark
  // timesheet auto_approved with overage zeroed out. No supplemental PIs.
  if (resolution === "accept_seeker") {
    if (ts.booking_source === "seeker") {
      const { data: primary } = await admin
        .from("payments")
        .select("stripe_payment_intent_id, status")
        .eq("booking_id", ts.booking_id)
        .eq("kind", "primary")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ stripe_payment_intent_id: string | null; status: string }>();
      if (primary?.stripe_payment_intent_id) {
        try {
          // Capture only the booked amount (whatever the PI was authorised for
          // is already booked subtotal). For now we capture as-is — the PI
          // amount equals the original booked total.
          if (primary.status === "requires_capture") {
            await stripe.paymentIntents.capture(primary.stripe_payment_intent_id);
            await admin
              .from("payments")
              .update({ status: "succeeded" })
              .eq("stripe_payment_intent_id", primary.stripe_payment_intent_id);
          }
        } catch (e) {
          if (e instanceof Stripe.errors.StripeError) {
            console.error("[admin.resolve] primary capture failed", e.message);
          }
        }
      }
    }
    await admin
      .from("shift_timesheets")
      .update({
        status: "approved",
        approved_at: nowIso,
        overage_minutes: 0,
        overage_cents: 0,
        overage_requires_approval: false,
        approver_user_id: user.id,
        approver_typed_reason: `admin_resolution_accept_seeker: ${notes.slice(0, 200)}`,
        updated_at: nowIso,
      })
      .eq("id", ts.id);
  } else {
    // accept_carer or partial — run the standard approval flow which mints
    // supplemental PIs / leaves the org draft invoice for the finalise cron.
    const result = await approveTimesheet(admin, {
      timesheetId: ts.id,
      approverUserId: user.id,
      approverIp: null,
      typedReason: `admin_resolution_${resolution}: ${notes.slice(0, 200)}`,
      tipCents: 0,
      auto: false,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
  }

  // Notify both parties.
  try {
    await admin.from("notifications").insert([
      {
        user_id: ts.carer_id,
        kind: "timesheet_dispute_resolved",
        title: "Dispute resolved",
        body: `Resolution: ${resolution}`,
        link_url: `/m/active-job/${ts.booking_id}`,
        payload: { booking_id: ts.booking_id, timesheet_id: ts.id, resolution },
      },
    ]);
    const { data: booking } = await admin
      .from("bookings")
      .select("seeker_id, organization_id, booking_source")
      .eq("id", ts.booking_id)
      .maybeSingle<{
        seeker_id: string;
        organization_id: string | null;
        booking_source: string;
      }>();
    if (booking) {
      const targets: string[] = [];
      if (booking.booking_source === "org" && booking.organization_id) {
        const { data: members } = await admin
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", booking.organization_id)
          .in("role", ["owner", "admin"]);
        for (const m of (members ?? []) as { user_id: string }[]) {
          targets.push(m.user_id);
        }
      } else {
        targets.push(booking.seeker_id);
      }
      const linkUrl =
        booking.booking_source === "org"
          ? `/m/org/bookings/${ts.booking_id}`
          : `/m/bookings/${ts.booking_id}`;
      if (targets.length > 0) {
        await admin.from("notifications").insert(
          targets.map((uid) => ({
            user_id: uid,
            kind: "timesheet_dispute_resolved",
            title: "Dispute resolved",
            body: `Resolution: ${resolution}`,
            link_url: linkUrl,
            payload: { booking_id: ts.booking_id, timesheet_id: ts.id, resolution },
          })),
        );
      }
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, resolution });
}
