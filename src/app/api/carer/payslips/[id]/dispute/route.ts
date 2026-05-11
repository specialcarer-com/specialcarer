import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";

const REASON_MIN = 10;
const REASON_MAX = 500;

/**
 * POST /api/carer/payslips/[id]/dispute
 * Body: { reason: string, booking_id?: string }
 *
 * Carer flags an issue with a draft payslip. Only valid while the parent
 * payroll_run is in status='preview_open' AND preview_closes_at hasn't
 * elapsed. Transitions the payout to status='disputed'.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    reason?: string;
    booking_id?: string;
  };
  const reason = (body.reason ?? "").trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return NextResponse.json(
      { error: `reason must be ${REASON_MIN}–${REASON_MAX} chars` },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  // Read payslip (owner-only via RLS).
  const { data: payslip } = await supabase
    .from("org_carer_payouts")
    .select("id, carer_id, run_id, status, period_start, period_end")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      carer_id: string;
      run_id: string | null;
      status: string;
      period_start: string;
      period_end: string;
    }>();
  if (!payslip) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (payslip.carer_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (payslip.status !== "draft") {
    return NextResponse.json(
      { error: "dispute_only_allowed_during_preview" },
      { status: 409 },
    );
  }

  // Must be inside the preview window.
  if (payslip.run_id) {
    const { data: run } = await supabase
      .from("payroll_runs")
      .select("status, preview_closes_at")
      .eq("id", payslip.run_id)
      .maybeSingle<{ status: string; preview_closes_at: string | null }>();
    if (!run || run.status !== "preview_open") {
      return NextResponse.json(
        { error: "preview_window_closed" },
        { status: 409 },
      );
    }
    if (run.preview_closes_at && new Date(run.preview_closes_at) <= new Date()) {
      return NextResponse.json(
        { error: "preview_window_closed" },
        { status: 409 },
      );
    }
  }

  const admin = createAdminClient();
  const reasonRow = body.booking_id
    ? `${reason}\n\nBooking: ${body.booking_id}`
    : reason;
  await admin
    .from("org_carer_payouts")
    .update({
      status: "disputed",
      dispute_reason: reasonRow,
      dispute_flagged_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Notify admin queue
  if (process.env.PAYROLL_DRY_RUN !== "true") {
    const adminEmail = process.env.PAYROLL_ADMIN_EMAIL ?? "ops@specialcarer.com";
    await sendEmail({
      to: adminEmail,
      subject: `Payslip dispute flagged — ${payslip.period_start} to ${payslip.period_end}`,
      html: `<p>A carer has flagged a dispute on their draft payslip.</p><p><strong>Carer:</strong> ${user.id}</p><p><strong>Reason:</strong> ${reason}</p>${body.booking_id ? `<p><strong>Booking:</strong> ${body.booking_id}</p>` : ""}<p>Review at https://specialcarer.com/admin/payroll/disputes</p>`,
      text: `Dispute flagged for ${user.id} on ${payslip.period_start}-${payslip.period_end}. Reason: ${reason}`,
    });
  }

  return NextResponse.json({ ok: true });
}
