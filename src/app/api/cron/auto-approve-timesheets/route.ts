import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveTimesheet } from "@/lib/timesheet/approve";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/auto-approve-timesheets
 *
 * Every 6h. Finds `shift_timesheets` where status='pending_approval',
 * auto_approve_at <= now(), AND overage_requires_approval=false. For each,
 * runs the same approval logic as POST /timesheet/approve with a synthetic
 * typed_reason. Tips are never applied automatically.
 *
 * Timesheets where `overage_requires_approval=true` are NEVER auto-approved
 * here — they sit until the seeker / org owner acts. (A separate admin
 * dashboard query flags them after 7 days; see /admin/timesheets.)
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();

  const { data: due, error } = await admin
    .from("shift_timesheets")
    .select("id, booking_id")
    .eq("status", "pending_approval")
    .eq("overage_requires_approval", false)
    .lte("auto_approve_at", new Date().toISOString())
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let approved = 0;
  const errors: { timesheet_id: string; error: string }[] = [];

  for (const ts of (due ?? []) as { id: string; booking_id: string }[]) {
    const result = await approveTimesheet(admin, {
      timesheetId: ts.id,
      // Null approver = system actor (cron). auto_approved status
      // distinguishes this from a real user's approval.
      approverUserId: null,
      approverIp: null,
      typedReason: "Auto-approved — no action within 48h",
      tipCents: 0,
      auto: true,
    });
    if (!result.ok) {
      errors.push({ timesheet_id: ts.id, error: result.error });
      continue;
    }
    approved += 1;
  }

  return NextResponse.json({
    scanned: due?.length ?? 0,
    approved,
    errors,
  });
}
