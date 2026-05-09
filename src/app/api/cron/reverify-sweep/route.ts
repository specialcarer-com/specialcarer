import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reverify-sweep
 *
 * Daily sweep: any background_check with `next_reverify_at` <= today
 * is flipped to status 'overdue'; <= today + 14 days flips to 'due'.
 * Idempotent — only updates rows whose status would actually change.
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
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);
  const dueCutoff = in14.toISOString().slice(0, 10);

  // Overdue: next_reverify_at < today AND status not already in_progress/cleared.
  const { error: e1, count: overdueCount } = await admin
    .from("background_checks")
    .update({ reverify_status: "overdue" }, { count: "exact" })
    .lt("next_reverify_at", today)
    .in("reverify_status", ["none", "due"]);

  // Due: next_reverify_at between today and today+14 AND status='none'.
  const { error: e2, count: dueCount } = await admin
    .from("background_checks")
    .update({ reverify_status: "due" }, { count: "exact" })
    .gte("next_reverify_at", today)
    .lte("next_reverify_at", dueCutoff)
    .eq("reverify_status", "none");

  if (e1 || e2) {
    return NextResponse.json(
      { error: e1?.message ?? e2?.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    overdue_marked: overdueCount ?? 0,
    due_marked: dueCount ?? 0,
  });
}
