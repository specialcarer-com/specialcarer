import { NextResponse } from "next/server";
import { logAdminAction, requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeRun, openPreview } from "@/lib/payroll/run-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/payroll/runs/[id]/trigger
 * Body: { action: "preview" | "run" }
 *
 * Manual admin trigger. Useful for re-running a failed cron, or running an
 * out-of-cycle correction payroll.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminUser = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action;
  if (action !== "preview" && action !== "run") {
    return NextResponse.json(
      { error: "action must be 'preview' or 'run'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: run } = await admin
    .from("payroll_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const r = run as {
    id: string;
    status: string;
    period_start: string;
    period_end: string;
    scheduled_run_date: string;
  };

  if (r.status === "running") {
    return NextResponse.json(
      { error: "run_already_in_progress" },
      { status: 409 },
    );
  }

  try {
    if (action === "preview") {
      const out = await openPreview(admin, r);
      await logAdminAction({
        admin: adminUser,
        action: "payroll.preview_open",
        targetType: "payroll_run",
        targetId: id,
        details: { carers: out.carers, errors: out.errors.length },
      });
      return NextResponse.json({ ok: true, ...out });
    } else {
      const out = await executeRun(admin, r);
      await logAdminAction({
        admin: adminUser,
        action: "payroll.run",
        targetType: "payroll_run",
        targetId: id,
        details: { carers: out.carers, total_net: out.total_net, errors: out.errors.length },
      });
      return NextResponse.json({ ok: true, ...out });
    }
  } catch (e) {
    await admin
      .from("payroll_runs")
      .update({ status: "failed", notes: e instanceof Error ? e.message : String(e) })
      .eq("id", id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "run_failed" },
      { status: 500 },
    );
  }
}
