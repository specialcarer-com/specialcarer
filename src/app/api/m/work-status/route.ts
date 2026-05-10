import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type WorkStatusCounts = {
  inbox: number;
  applied: number;
  upcoming: number;
  in_progress: number;
  completed: number;
  declined: number;
};

export type WorkStatusResponse = {
  counts: WorkStatusCounts;
  hasAnyActivity: boolean;
};

/**
 * GET /api/m/work-status
 *
 * Carer-only. Returns count summaries for each work-inbox tab so the
 * shell can decide the default mode (my-work vs find-work) and the
 * BottomNav Jobs badge can show an unread count.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify role = caregiver
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (profile?.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  // Inbox: offered OR (pending + preferred_carer_id) — not declined, not expired
  const { count: inboxCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("caregiver_id", user.id)
    .is("declined_at", null)
    .or(
      `status.eq.offered,and(status.eq.pending,preferred_carer_id.eq.${user.id})`,
    )
    .or(`offer_expires_at.is.null,offer_expires_at.gt.${now}`);

  // applied → v1 always 0 (no applications table yet)
  const appliedCount = 0;

  // upcoming: accepted or paid, starts in future, not started, not cancelled
  const { count: upcomingCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("caregiver_id", user.id)
    .in("status", ["accepted", "paid"])
    .gt("starts_at", now)
    .is("actual_started_at", null)
    .is("cancelled_at", null);

  // in_progress: status = in_progress OR started but not checked out
  const { count: inProgressCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("caregiver_id", user.id)
    .or(
      `status.eq.in_progress,and(actual_started_at.not.is.null,checked_out_at.is.null)`,
    );

  // completed: capped at 50
  const { count: completedCountRaw } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("caregiver_id", user.id)
    .or(
      `status.in.(completed,paid_out),shift_completed_at.not.is.null`,
    )
    .limit(50);

  // declined: declined_at set OR status cancelled — capped at 50
  const { count: declinedCountRaw } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("caregiver_id", user.id)
    .or(`declined_at.not.is.null,status.eq.cancelled`)
    .limit(50);

  const counts: WorkStatusCounts = {
    inbox: inboxCount ?? 0,
    applied: appliedCount,
    upcoming: upcomingCount ?? 0,
    in_progress: inProgressCount ?? 0,
    completed: Math.min(completedCountRaw ?? 0, 50),
    declined: Math.min(declinedCountRaw ?? 0, 50),
  };

  const total =
    counts.inbox +
    counts.applied +
    counts.upcoming +
    counts.in_progress +
    counts.completed +
    counts.declined;

  return NextResponse.json({
    counts,
    hasAnyActivity: total > 0,
  } satisfies WorkStatusResponse);
}
