import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/bookings/[id]/timesheet
 *
 * Returns the `shift_timesheets` row for this booking (if any) plus the
 * currently-pending `shift_time_adjustments` row (if any). Auth is enforced
 * by the RLS policies on those tables — RLS lets:
 *   - carer reads own timesheet
 *   - seeker reads booking's timesheet
 *   - org member reads org-booking's timesheet
 *   - admin reads all
 *
 * Returns `{ timesheet: null }` if no row, never throws.
 */
export async function GET(
  _req: Request,
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

  const { data: ts } = await supabase
    .from("shift_timesheets")
    .select(
      [
        "id",
        "booking_id",
        "booking_source",
        "status",
        "submitted_at",
        "actual_start",
        "actual_end",
        "actual_minutes",
        "booked_minutes",
        "hourly_rate_cents",
        "currency",
        "overage_minutes",
        "overage_cents",
        "overage_requires_approval",
        "overage_cap_reason",
        "overtime_minutes",
        "overtime_cents",
        "gps_verified",
        "forced_check_in",
        "forced_check_out",
        "tasks_completed",
        "carer_notes",
        "carer_photos",
        "auto_approve_at",
        "approved_at",
        "dispute_reason",
        "dispute_opened_at",
        "pending_adjustment_id",
      ].join(", "),
    )
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!ts) {
    return NextResponse.json({ timesheet: null, pending_adjustment: null });
  }

  let pendingAdjustment = null;
  // ts is a row from .maybeSingle() — cast to read the field.
  const tsRow = ts as unknown as {
    pending_adjustment_id?: string | null;
  };
  if (tsRow.pending_adjustment_id) {
    const { data: adj } = await supabase
      .from("shift_time_adjustments")
      .select(
        "id, proposer_role, proposer_user_id, proposed_start, proposed_end, proposed_minutes, reason",
      )
      .eq("id", tsRow.pending_adjustment_id)
      .eq("status", "pending")
      .maybeSingle();
    pendingAdjustment = adj ?? null;
  }

  return NextResponse.json({
    timesheet: ts,
    pending_adjustment: pendingAdjustment,
  });
}
