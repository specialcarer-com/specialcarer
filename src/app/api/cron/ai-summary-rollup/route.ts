import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizePeriod } from "@/lib/ai/summaries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ai-summary-rollup
 *
 * Daily — for each recipient with care_journal_entries in the last 7
 * days, generate a weekly summary covering the previous Mon–Sun.
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

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: rows } = await admin
    .from("care_journal_entries")
    .select("about_user_id")
    .gte("created_at", since.toISOString())
    .not("about_user_id", "is", null)
    .limit(10_000);

  const recipients = Array.from(
    new Set(
      ((rows ?? []) as { about_user_id: string | null }[])
        .map((r) => r.about_user_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  // Period = previous Monday 00:00 UTC → previous Sunday 23:59:59 UTC.
  // JS getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat.
  const today = new Date();
  const dow = today.getUTCDay();
  // Days since most recent Sunday (last day of "previous" week).
  // If today is Sunday we still treat the prior 7-day window.
  const daysSinceSunday = dow === 0 ? 7 : dow;
  const sundayEnd = new Date(today);
  sundayEnd.setUTCDate(today.getUTCDate() - daysSinceSunday);
  sundayEnd.setUTCHours(23, 59, 59, 999);
  const mondayStart = new Date(sundayEnd);
  mondayStart.setUTCDate(sundayEnd.getUTCDate() - 6);
  mondayStart.setUTCHours(0, 0, 0, 0);

  const periodStart = mondayStart.toISOString();
  const periodEnd = sundayEnd.toISOString();

  let written = 0;
  for (const id of recipients) {
    try {
      const s = await summarizePeriod({
        recipientId: id,
        scope: "weekly",
        periodStart,
        periodEnd,
      });
      if (s) written += 1;
    } catch (e) {
      console.error("weekly summary failed for", id, e);
    }
  }
  return NextResponse.json({
    ok: true,
    recipients: recipients.length,
    written,
    period_start: periodStart,
    period_end: periodEnd,
  });
}
