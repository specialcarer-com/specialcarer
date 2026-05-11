import { NextResponse } from "next/server";
import { logAdminAction, requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payroll/disputes/[id]/resolve
 * Body: { resolution: "approve_change" | "reject", notes?: string }
 *
 * Resolving a dispute marks the payout for inclusion in the NEXT run (status
 * → 'pending') if approved, or returns it to 'confirmed' for the current
 * run if rejected. Either way, dispute_resolved_at is set so it disappears
 * from the admin queue.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminUser = await requireAdmin();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    resolution?: string;
    notes?: string;
  };
  if (body.resolution !== "approve_change" && body.resolution !== "reject") {
    return NextResponse.json(
      { error: "resolution must be 'approve_change' or 'reject'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: payout } = await admin
    .from("org_carer_payouts")
    .select("id, carer_id, run_id, period_start, period_end, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      carer_id: string;
      run_id: string;
      period_start: string;
      period_end: string;
      status: string;
    }>();
  if (!payout) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (payout.status !== "disputed") {
    return NextResponse.json({ error: "not_in_dispute" }, { status: 409 });
  }

  const nextStatus = body.resolution === "approve_change" ? "pending" : "confirmed";
  const update: Record<string, unknown> = {
    status: nextStatus,
    dispute_resolved_at: new Date().toISOString(),
    dispute_resolved_by: adminUser.id,
  };
  // If approved, this payout needs to be reprocessed next run — detach run_id.
  if (body.resolution === "approve_change") {
    update.run_id = null;
  }

  await admin.from("org_carer_payouts").update(update).eq("id", id);

  await logAdminAction({
    admin: adminUser,
    action: "payroll.dispute_resolve",
    targetType: "org_carer_payouts",
    targetId: id,
    details: { resolution: body.resolution, notes: body.notes ?? null },
  });

  // Notify carer
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", payout.carer_id)
    .maybeSingle<{ full_name: string | null; email: string | null }>();
  if (profile?.email && process.env.PAYROLL_DRY_RUN !== "true") {
    const label = body.resolution === "approve_change" ? "approved" : "reviewed";
    await sendEmail({
      to: profile.email,
      subject: `Your payslip dispute has been ${label}`,
      html: `<p>Hi ${profile.full_name ?? "there"},</p><p>Your dispute for the ${payout.period_start} – ${payout.period_end} period has been ${label}.</p>${body.notes ? `<p>Notes from admin: ${body.notes}</p>` : ""}<p>If approved, your corrected pay will be included in next month's payroll.</p>`,
      text: `Your dispute for ${payout.period_start}–${payout.period_end} has been ${label}.${body.notes ? "\n\nNotes: " + body.notes : ""}`,
    });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
