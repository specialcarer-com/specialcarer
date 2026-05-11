import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/timesheet-reminders
 *
 * Every 6h. For pending_approval timesheets older than 24h with no
 * reminder_sent_at, push a notification to the approver (seeker or org
 * owners/admins) and stamp reminder_sent_at so we don't re-spam.
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
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("shift_timesheets")
    .select(
      "id, booking_id, booking_source, auto_approve_at, overage_requires_approval",
    )
    .eq("status", "pending_approval")
    .is("reminder_sent_at", null)
    .lt("submitted_at", cutoff)
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  const errors: { timesheet_id: string; error: string }[] = [];

  for (const ts of (rows ?? []) as Array<{
    id: string;
    booking_id: string;
    booking_source: string;
    auto_approve_at: string;
    overage_requires_approval: boolean;
  }>) {
    try {
      const { data: booking } = await admin
        .from("bookings")
        .select("seeker_id, organization_id, booking_source")
        .eq("id", ts.booking_id)
        .maybeSingle<{
          seeker_id: string;
          organization_id: string | null;
          booking_source: string;
        }>();
      if (!booking) continue;

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
      const remaining = Math.max(
        0,
        Date.parse(ts.auto_approve_at) - Date.now(),
      );
      const hoursLeft = Math.max(1, Math.round(remaining / 3600 / 1000));
      const body = ts.overage_requires_approval
        ? "This shift ran significantly over booked time and won't auto-approve. Please review."
        : `Auto-approves in ${hoursLeft}h if you don't confirm or dispute.`;

      if (targets.length > 0) {
        await admin.from("notifications").insert(
          targets.map((uid) => ({
            user_id: uid,
            kind: "timesheet_reminder",
            title: "Timesheet still awaiting review",
            body,
            link_url: linkUrl,
            payload: { booking_id: ts.booking_id, timesheet_id: ts.id },
          })),
        );
      }

      await admin
        .from("shift_timesheets")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", ts.id);
      sent += 1;
    } catch (e) {
      errors.push({
        timesheet_id: ts.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    scanned: rows?.length ?? 0,
    reminders_sent: sent,
    errors,
  });
}
