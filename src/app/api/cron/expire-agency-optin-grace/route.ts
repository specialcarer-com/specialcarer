import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { renderOptInGraceExpiredEmail } from "@/lib/email/agency-optin-templates";

export const dynamic = "force-dynamic";

type Carer = {
  user_id: string;
  agency_opt_in_status: string;
  agency_optin_grace_period_until: string | null;
  in_grace_period: boolean | null;
  overall_ready: boolean | null;
};

/**
 * GET /api/cron/expire-agency-optin-grace
 *
 * Daily sweep. For every carer whose grace period has expired AND who is
 * not currently meeting all gates, flip status from 'active' →
 * 'in_progress' (the "gates pending" state in our existing enum) and send
 * a grace-expired email.
 *
 * Idempotent. Safe to run repeatedly.
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
  const { data, error } = await admin
    .from("v_agency_opt_in_gates")
    .select(
      "user_id, agency_opt_in_status, agency_optin_grace_period_until, in_grace_period, overall_ready",
    )
    .eq("agency_opt_in_status", "active")
    .not("agency_optin_grace_period_until", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Carer[];

  let flipped = 0;
  let emailed = 0;
  for (const c of rows) {
    if (c.in_grace_period) continue; // still in grace window
    if (c.overall_ready) continue; // gates green again — no action

    const { error: upErr } = await admin
      .from("profiles")
      .update({
        agency_opt_in_status: "in_progress",
        agency_opt_in_paused_reason:
          "Compliance grace period expired with outstanding mandatory training.",
      })
      .eq("id", c.user_id)
      .eq("agency_opt_in_status", "active"); // guard against races
    if (upErr) {
      console.error("[cron.expire-grace] flip failed", c.user_id, upErr);
      continue;
    }
    flipped++;

    try {
      const { data: u } = await admin.auth.admin.getUserById(c.user_id);
      const email = u.user?.email ?? null;
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", c.user_id)
        .maybeSingle<{ full_name: string | null }>();
      const name = (prof?.full_name ?? "").trim() || "there";
      if (email) {
        const tpl = renderOptInGraceExpiredEmail({ name });
        await sendEmail({
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
        emailed++;
      }
    } catch (e) {
      console.error("[cron.expire-grace] email failed", c.user_id, e);
    }
  }

  return NextResponse.json({ ok: true, candidates: rows.length, flipped, emailed });
}
