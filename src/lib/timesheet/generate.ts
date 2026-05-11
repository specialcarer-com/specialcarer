/**
 * Server-only timesheet generation. Called from /api/bookings/[id]/action
 * when a caregiver marks a shift `complete`.
 *
 * Pure DB orchestration: computes actual_minutes / overage / FLSA overtime,
 * inserts a `shift_timesheets` row with `status='pending_approval'` and
 * `auto_approve_at = now() + 48h`, drops a `timesheet_submitted` journal
 * event, and notifies the seeker (or org_member-of-record).
 *
 * Returns the created timesheet row. Idempotent: a UNIQUE(booking_id)
 * constraint means re-running this is a no-op (returns the existing row).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TIMESHEET_CONFIG,
  ceilToRoundedMinutes,
  overageCapReason,
  overageCashCapCents,
} from "./config";
import { recordSystemEventOnce } from "@/lib/journal/system-events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export type GenerateInput = {
  bookingId: string;
  /** Carer who just checked out. */
  caregiverId: string;
  /** Seeker_id from the booking row. */
  seekerId: string;
  /** 'seeker' | 'org' — copied to timesheet so the cron knows which capture path to use. */
  bookingSource: "seeker" | "org";
  /** When the carer arrived (already stamped by check-in). */
  actualStartIso: string;
  /** When the carer checked out (set by the same `complete` action). */
  actualEndIso: string;
  /** Booked window from the original booking row. */
  bookedStartIso: string;
  bookedEndIso: string;
  hourlyRateCents: number;
  /** 'gbp' | 'usd'. */
  currency: string;
  /** Forced check-in / check-out flags from the booking row at time of complete. */
  forcedCheckIn: boolean;
  forcedCheckOut: boolean;
};

export type GeneratedTimesheet = {
  id: string;
  status: "pending_approval";
  actualMinutes: number;
  bookedMinutes: number;
  overageMinutes: number;
  overageCents: number;
  overageRequiresApproval: boolean;
  overageCapReason: "duration_1.5x" | "cash_cap" | "both" | null;
  overtimeMinutes: number;
  overtimeCents: number;
  autoApproveAt: string;
  isOrg: boolean;
};

/**
 * Compute FLSA overtime for US bookings only.
 *
 * Sums actual_minutes from previously completed seeker-channel bookings in
 * the rolling 7d window ending at this shift's check-out, for the same
 * (caregiver_id, seeker_id) pair. Overtime is only the portion of THIS
 * shift's minutes that cross the 40h cumulative line; the extra is the
 * 0.5× multiplier (1.5× total, minus 1× already in the base rate).
 *
 * Per spec: US-only — gated on currency='usd'. We avoid an extra
 * seeker.country lookup; currency is already authoritative.
 */
async function computeFlsaOvertime(args: {
  admin: AnySupabase;
  caregiverId: string;
  seekerId: string;
  currency: string;
  actualMinutesThisShift: number;
  actualEndIso: string;
  hourlyRateCents: number;
}): Promise<{ overtimeMinutes: number; overtimeCents: number }> {
  if (args.currency.toLowerCase() !== "usd") {
    return { overtimeMinutes: 0, overtimeCents: 0 };
  }

  const windowStartIso = new Date(
    Date.parse(args.actualEndIso) - 7 * 24 * 3600 * 1000,
  ).toISOString();

  // Prefer the timesheet table for "actual" minutes when present; fall back
  // to the booking's actual_started_at → checked_out_at delta otherwise.
  const { data: priorTimesheets } = await args.admin
    .from("shift_timesheets")
    .select("actual_minutes, booking_id")
    .eq("carer_id", args.caregiverId)
    .gte("submitted_at", windowStartIso)
    .lt("submitted_at", args.actualEndIso);

  const tsByBooking = new Map<string, number>();
  for (const t of (priorTimesheets ?? []) as { actual_minutes: number; booking_id: string }[]) {
    tsByBooking.set(t.booking_id, t.actual_minutes);
  }

  const { data: priorBookings } = await args.admin
    .from("bookings")
    .select(
      "id, status, actual_started_at, checked_out_at, ends_at, starts_at, hours",
    )
    .eq("caregiver_id", args.caregiverId)
    .eq("seeker_id", args.seekerId)
    .eq("booking_source", "seeker")
    .in("status", ["completed", "paid_out", "paid"])
    .gte("shift_completed_at", windowStartIso)
    .lt("shift_completed_at", args.actualEndIso);

  let priorMinutes = 0;
  for (const b of (priorBookings ?? []) as Array<{
    id: string;
    actual_started_at: string | null;
    checked_out_at: string | null;
    ends_at: string | null;
    starts_at: string | null;
    hours: number | null;
  }>) {
    const tsMin = tsByBooking.get(b.id);
    if (tsMin != null) {
      priorMinutes += tsMin;
      continue;
    }
    if (b.actual_started_at && b.checked_out_at) {
      const m = Math.max(
        0,
        Math.round(
          (Date.parse(b.checked_out_at) - Date.parse(b.actual_started_at)) /
            60000,
        ),
      );
      priorMinutes += m;
    } else if (b.hours != null) {
      priorMinutes += Math.round(Number(b.hours) * 60);
    }
  }

  const overtimeLineMin = TIMESHEET_CONFIG.FLSA_OVERTIME_HOURS * 60;
  if (priorMinutes + args.actualMinutesThisShift <= overtimeLineMin) {
    return { overtimeMinutes: 0, overtimeCents: 0 };
  }
  // Overtime portion of THIS shift (don't retro-bill prior weeks here).
  const overtimeMinutes = Math.max(
    0,
    Math.min(
      args.actualMinutesThisShift,
      priorMinutes + args.actualMinutesThisShift - overtimeLineMin,
    ),
  );
  // 0.5× extra (base rate already covers 1×; the supplemental PI bills the 0.5).
  const extraMultiplier =
    TIMESHEET_CONFIG.FLSA_OVERTIME_MULTIPLIER - 1; // 0.5
  const overtimeCents = Math.ceil(
    (overtimeMinutes / 60) * args.hourlyRateCents * extraMultiplier,
  );
  return { overtimeMinutes, overtimeCents };
}

/**
 * Idempotent — returns the existing row when a timesheet already exists
 * for this booking (UNIQUE constraint), so retries from a flaky network
 * don't double-bill.
 */
export async function generateTimesheetOnComplete(
  admin: AnySupabase,
  input: GenerateInput,
): Promise<GeneratedTimesheet | null> {
  // Idempotency check first.
  const { data: existing } = await admin
    .from("shift_timesheets")
    .select(
      "id, status, actual_minutes, booked_minutes, overage_minutes, overage_cents, overage_requires_approval, overage_cap_reason, overtime_minutes, overtime_cents, auto_approve_at, booking_source",
    )
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (existing) {
    return {
      id: existing.id,
      status: "pending_approval",
      actualMinutes: existing.actual_minutes,
      bookedMinutes: existing.booked_minutes,
      overageMinutes: existing.overage_minutes,
      overageCents: existing.overage_cents,
      overageRequiresApproval: existing.overage_requires_approval,
      overageCapReason: existing.overage_cap_reason ?? null,
      overtimeMinutes: existing.overtime_minutes,
      overtimeCents: existing.overtime_cents,
      autoApproveAt: existing.auto_approve_at,
      isOrg: existing.booking_source === "org",
    };
  }

  const actualStartMs = Date.parse(input.actualStartIso);
  const actualEndMs = Date.parse(input.actualEndIso);
  const bookedStartMs = Date.parse(input.bookedStartIso);
  const bookedEndMs = Date.parse(input.bookedEndIso);

  if (
    !Number.isFinite(actualStartMs) ||
    !Number.isFinite(actualEndMs) ||
    actualEndMs <= actualStartMs
  ) {
    return null;
  }

  const rawActualMinutes = Math.round((actualEndMs - actualStartMs) / 60000);
  const actualMinutes = ceilToRoundedMinutes(rawActualMinutes);
  const bookedMinutes =
    Number.isFinite(bookedStartMs) && Number.isFinite(bookedEndMs)
      ? Math.max(0, Math.round((bookedEndMs - bookedStartMs) / 60000))
      : 0;

  const overageMinutes = Math.max(0, actualMinutes - bookedMinutes);
  const overageCents = Math.ceil((overageMinutes / 60) * input.hourlyRateCents);
  const capReason = overageCapReason({
    actualMinutes,
    bookedMinutes,
    overageCents,
    currency: input.currency,
  });
  const overageRequiresApproval = capReason !== null;

  const { overtimeMinutes, overtimeCents } = await computeFlsaOvertime({
    admin,
    caregiverId: input.caregiverId,
    seekerId: input.seekerId,
    currency: input.currency,
    actualMinutesThisShift: actualMinutes,
    actualEndIso: input.actualEndIso,
    hourlyRateCents: input.hourlyRateCents,
  });

  const autoApproveAt = new Date(
    Date.now() + TIMESHEET_CONFIG.AUTO_APPROVE_HOURS * 3600 * 1000,
  ).toISOString();

  const gpsVerified = !input.forcedCheckIn && !input.forcedCheckOut;

  const { data: inserted, error } = await admin
    .from("shift_timesheets")
    .insert({
      booking_id: input.bookingId,
      carer_id: input.caregiverId,
      booking_source: input.bookingSource,
      submitted_at: new Date().toISOString(),
      actual_start: input.actualStartIso,
      actual_end: input.actualEndIso,
      actual_minutes: actualMinutes,
      booked_minutes: bookedMinutes,
      hourly_rate_cents: input.hourlyRateCents,
      currency: input.currency,
      overage_minutes: overageMinutes,
      overage_cents: overageCents,
      overage_requires_approval: overageRequiresApproval,
      overage_cap_reason: capReason,
      overtime_minutes: overtimeMinutes,
      overtime_cents: overtimeCents,
      gps_verified: gpsVerified,
      forced_check_in: input.forcedCheckIn,
      forced_check_out: input.forcedCheckOut,
      status: "pending_approval",
      auto_approve_at: autoApproveAt,
    })
    .select(
      "id, status, actual_minutes, booked_minutes, overage_minutes, overage_cents, overage_requires_approval, overage_cap_reason, overtime_minutes, overtime_cents, auto_approve_at",
    )
    .single();

  if (error || !inserted) {
    console.error("[timesheet.generate] insert failed", error);
    return null;
  }

  // Best-effort journal entry.
  try {
    const { data: prof } = await admin
      .from("caregiver_profiles")
      .select("display_name")
      .eq("user_id", input.caregiverId)
      .maybeSingle<{ display_name: string | null }>();
    await recordSystemEventOnce(admin, {
      bookingId: input.bookingId,
      kind: "timesheet_submitted",
      actorName: prof?.display_name ?? null,
      authorId: input.caregiverId,
    });
  } catch (e) {
    console.error("[timesheet.generate] journal event failed", e);
  }

  // Best-effort notification — surfaces in the seeker's bell + email.
  try {
    await notifyApproverOfTimesheet({
      admin,
      bookingId: input.bookingId,
      seekerId: input.seekerId,
      bookingSource: input.bookingSource,
      autoApproveAt,
      overageRequiresApproval,
      overageCents,
      overageCashCapCents: overageCashCapCents(input.currency),
    });
  } catch (e) {
    console.error("[timesheet.generate] notify failed", e);
  }

  return {
    id: inserted.id,
    status: "pending_approval",
    actualMinutes,
    bookedMinutes,
    overageMinutes,
    overageCents,
    overageRequiresApproval,
    overageCapReason: capReason,
    overtimeMinutes,
    overtimeCents,
    autoApproveAt,
    isOrg: input.bookingSource === "org",
  };
}

/**
 * Inserts a `notifications` row for each user who should review the
 * timesheet. For seeker bookings → the seeker. For org bookings → every
 * owner/admin member of the org. Best-effort; the cron and the UI both
 * keep working without notifications.
 */
async function notifyApproverOfTimesheet(args: {
  admin: AnySupabase;
  bookingId: string;
  seekerId: string;
  bookingSource: "seeker" | "org";
  autoApproveAt: string;
  overageRequiresApproval: boolean;
  overageCents: number;
  overageCashCapCents: number;
}): Promise<void> {
  const link =
    args.bookingSource === "org"
      ? `/m/org/bookings/${args.bookingId}`
      : `/m/bookings/${args.bookingId}`;

  const title = args.overageRequiresApproval
    ? "Timesheet needs your approval"
    : "Timesheet ready to confirm";
  const body = args.overageRequiresApproval
    ? "This shift ran significantly over booked time. Confirm or dispute within 48 hours."
    : "Auto-approves in 48 hours if you don't act.";

  if (args.bookingSource === "seeker") {
    await args.admin.from("notifications").insert({
      user_id: args.seekerId,
      kind: "timesheet_pending_approval",
      title,
      body,
      link_url: link,
      payload: {
        booking_id: args.bookingId,
        auto_approve_at: args.autoApproveAt,
        overage_requires_approval: args.overageRequiresApproval,
        overage_cents: args.overageCents,
      },
    });
    return;
  }

  // Org route — find organization_id from booking, notify owner/admin.
  const { data: booking } = await args.admin
    .from("bookings")
    .select("organization_id")
    .eq("id", args.bookingId)
    .maybeSingle<{ organization_id: string | null }>();
  if (!booking?.organization_id) return;
  const { data: members } = await args.admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", booking.organization_id)
    .in("role", ["owner", "admin"]);
  const rows = (members ?? []).map((m: { user_id: string }) => ({
    user_id: m.user_id,
    kind: "timesheet_pending_approval",
    title,
    body,
    link_url: link,
    payload: {
      booking_id: args.bookingId,
      auto_approve_at: args.autoApproveAt,
      overage_requires_approval: args.overageRequiresApproval,
      overage_cents: args.overageCents,
    },
  }));
  if (rows.length > 0) {
    await args.admin.from("notifications").insert(rows);
  }
}
