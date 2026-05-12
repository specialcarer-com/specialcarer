import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeNextUsCheckDueAt } from "@/lib/dbs/provider";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dbs-update-service/decide
 *
 * Body: { event_id, decision: 'cleared'|'suspended'|'requires_fresh_dbs', notes? }
 *
 * - 'cleared': marks the change-event reviewed and (for `manual_pending`
 *   events) flips the matching pending background_checks row to cleared
 *   with a fresh 12-month next_us_check_due_at. Gate goes green.
 * - 'suspended' / 'requires_fresh_dbs': flips the carer's
 *   agency_opt_in_status to 'paused' (cannot accept new Channel B
 *   bookings). Existing allocated bookings are NOT retroactively
 *   unassigned (Phase 5 follow-up).
 */
type Decision = "cleared" | "suspended" | "requires_fresh_dbs";

export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const eventId = typeof body.event_id === "string" ? body.event_id : null;
  const decision = body.decision as Decision | undefined;
  const notes = typeof body.notes === "string" ? body.notes : null;
  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }
  if (
    decision !== "cleared" &&
    decision !== "suspended" &&
    decision !== "requires_fresh_dbs"
  ) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ev, error } = await admin
    .from("dbs_change_events")
    .select("id, carer_id, new_status, admin_reviewed_at")
    .eq("id", eventId)
    .maybeSingle<{
      id: string;
      carer_id: string;
      new_status: string | null;
      admin_reviewed_at: string | null;
    }>();
  if (error || !ev) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (ev.admin_reviewed_at) {
    return NextResponse.json(
      { error: "Already reviewed" },
      { status: 409 },
    );
  }

  const now = new Date();
  const reviewedAt = now.toISOString();

  await admin
    .from("dbs_change_events")
    .update({
      admin_reviewed_at: reviewedAt,
      admin_reviewer_id: guard.admin.id,
      admin_decision: decision,
      admin_notes: notes,
    })
    .eq("id", eventId);

  if (decision === "cleared") {
    // If the event was a manual_pending submission, find the pending
    // background_checks row and flip to cleared with a 12mo recheck.
    if (ev.new_status === "manual_pending") {
      const { data: pending } = await admin
        .from("background_checks")
        .select("id")
        .eq("user_id", ev.carer_id)
        .eq("source", "update_service")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (pending) {
        const nextDue = computeNextUsCheckDueAt(now).toISOString();
        await admin
          .from("background_checks")
          .update({
            status: "cleared",
            issued_at: reviewedAt,
            last_us_check_at: reviewedAt,
            next_us_check_due_at: nextDue,
            us_check_result: {
              status: "current",
              verified_by_admin: guard.admin.id,
              verified_at: reviewedAt,
            },
          })
          .eq("id", pending.id);
      }
    }
  }

  if (decision === "suspended" || decision === "requires_fresh_dbs") {
    await admin
      .from("profiles")
      .update({
        agency_opt_in_status: "paused",
        agency_opt_in_paused_reason:
          decision === "requires_fresh_dbs"
            ? "DBS change detected — fresh check required"
            : "DBS change detected — suspended pending review",
      })
      .eq("id", ev.carer_id);
  }

  await logAdminAction({
    admin: guard.admin,
    action: "dbs_change_decision",
    targetType: "dbs_change_event",
    targetId: eventId,
    details: { decision, notes, carer_id: ev.carer_id },
  });

  return NextResponse.json({ ok: true });
}
