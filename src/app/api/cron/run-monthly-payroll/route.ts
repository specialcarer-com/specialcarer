import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeRun, openPreview } from "@/lib/payroll/run-engine";
import {
  getPayrollRunDateIso,
  getPreviewCloseAt,
  getPreviewOpenAt,
} from "@/lib/payroll/uk-bank-holidays";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/run-monthly-payroll
 *
 * Daily cron at 09:00 UTC. Dispatches one of three sub-actions per the
 * currently-scheduled payroll_runs row:
 *   - At T-72h (preview_opens_at ≤ now): openPreview()
 *   - At T-24h..T-0h (preview_closes_at ≤ now): executeRun()
 *
 * The cron is intentionally idempotent: it inspects state and only acts on
 * runs whose status hasn't yet advanced past the relevant gate. If no run
 * is due, it auto-schedules the next one (this month's run, or next month's
 * if we're already past this month's 15th).
 *
 * Authorisation: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
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
  const now = new Date();
  const actions: string[] = [];

  // 1) Make sure a run is scheduled for the upcoming or current month.
  await ensureUpcomingRunScheduled(admin, now);

  // 2) Find runs whose preview window has opened but they're still 'scheduled'.
  {
    const { data: due } = await admin
      .from("payroll_runs")
      .select("*")
      .eq("status", "scheduled")
      .lte("preview_opens_at", now.toISOString())
      .limit(5);
    for (const r of due ?? []) {
      const run = r as { id: string; period_start: string; period_end: string; scheduled_run_date: string; status: string };
      const out = await openPreview(admin, run);
      actions.push(`preview_open:${run.id}:carers=${out.carers}`);
    }
  }

  // 3) Find runs whose preview has closed (now >= preview_closes_at and now
  //    >= scheduled_run_date) and are still in preview_open.
  {
    const { data: due } = await admin
      .from("payroll_runs")
      .select("*")
      .eq("status", "preview_open")
      .lte("scheduled_run_date", now.toISOString().slice(0, 10))
      .limit(5);
    for (const r of due ?? []) {
      const run = r as { id: string; period_start: string; period_end: string; scheduled_run_date: string; status: string };
      try {
        const out = await executeRun(admin, run);
        actions.push(
          `run_executed:${run.id}:carers=${out.carers}:net=${out.total_net}`,
        );
      } catch (e) {
        await admin
          .from("payroll_runs")
          .update({ status: "failed", notes: e instanceof Error ? e.message : String(e) })
          .eq("id", run.id);
        actions.push(`run_failed:${run.id}`);
      }
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), actions });
}

/**
 * Ensure there is a payroll_runs row for the next-upcoming run date.
 * If we're before the 15th of THIS month, we target this month. If after,
 * we target next month.
 */
async function ensureUpcomingRunScheduled(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
): Promise<void> {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1..12
  const todayDay = now.getUTCDate();

  // Target run month: if today's day > 15, look at next month.
  let runYear = y;
  let runMonth = m;
  if (todayDay > 15) {
    runMonth++;
    if (runMonth > 12) {
      runMonth = 1;
      runYear++;
    }
  }

  const runDateIso = getPayrollRunDateIso(runYear, runMonth);
  const runDate = new Date(`${runDateIso}T00:00:00Z`);
  const previewOpen = getPreviewOpenAt(runDate);
  const previewClose = getPreviewCloseAt(runDate);

  // The pay period is the PREVIOUS calendar month (pay for last month's
  // shifts, run on this month's 15th).
  const periodEndDate = new Date(Date.UTC(runYear, runMonth - 1, 1));
  const periodStartDate = new Date(
    Date.UTC(periodEndDate.getUTCFullYear(), periodEndDate.getUTCMonth() - 1, 1),
  );
  const periodStart = periodStartDate.toISOString().slice(0, 10);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  await admin
    .from("payroll_runs")
    .upsert(
      {
        period_start: periodStart,
        period_end: periodEnd,
        scheduled_run_date: runDateIso,
        preview_opens_at: previewOpen.toISOString(),
        preview_closes_at: previewClose.toISOString(),
        status: "scheduled",
      },
      { onConflict: "period_start,period_end", ignoreDuplicates: true },
    );
}
