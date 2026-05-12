import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/dbs-update-service-reminder
 *
 * Daily. For carers whose next Update Service recheck is within the
 * next 7 days, send a reminder email so they keep the £16 subscription
 * active. Idempotent: we only send if us_reminder_sent_at is null OR
 * older than 7 days, then stamp us_reminder_sent_at.
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
  const sevenDays = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("background_checks")
    .select(
      "id, user_id, next_us_check_due_at, us_reminder_sent_at",
    )
    .eq("source", "update_service")
    .eq("status", "cleared")
    .not("next_us_check_due_at", "is", null)
    .lte("next_us_check_due_at", sevenDays)
    .gte("next_us_check_due_at", now.toISOString())
    .or(
      `us_reminder_sent_at.is.null,us_reminder_sent_at.lt.${sevenDaysAgo}`,
    )
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  const errors: { user_id: string; message: string }[] = [];

  for (const row of (rows ?? []) as Array<{
    id: string;
    user_id: string;
    next_us_check_due_at: string;
    us_reminder_sent_at: string | null;
  }>) {
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", row.user_id)
        .maybeSingle<{ full_name: string | null; email: string | null }>();
      const email = profile?.email;
      if (!email) continue;
      const dueDate = new Date(row.next_us_check_due_at);
      const daysLeft = Math.max(
        0,
        Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000)),
      );
      const name = profile?.full_name ?? "there";
      const subject = `Your DBS Update Service check is in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
      const html = `<!DOCTYPE html>
<html><body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#F7FAFA;margin:0;padding:24px;color:#2F2E31">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
    <h2 style="color:#0E7C7B;margin:0 0 8px">DBS recheck due soon</h2>
    <p>Hi ${name},</p>
    <p>Your DBS Update Service status check is due on <strong>${dueDate.toLocaleDateString("en-GB")}</strong> (${daysLeft} day${daysLeft === 1 ? "" : "s"} away). We recheck every 6 months as a safeguarding measure.</p>
    <p>Please make sure your £16/year DBS Update Service subscription is <strong>still active</strong> — if it lapses, your Channel B gate will go red and we&apos;ll have to arrange a fresh DBS.</p>
    <p>You can check your subscription status here: <a href="https://www.gov.uk/dbs-update-service" style="color:#0E7C7B">gov.uk/dbs-update-service</a></p>
    <p style="margin:24px 0">
      <a href="https://specialcarer.com/dashboard/agency-optin" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open my dashboard
      </a>
    </p>
    <p style="font-size:11px;color:#575757;margin-top:24px">SpecialCarer · A product of All Care 4 U Group Ltd</p>
  </div>
</body></html>`;
      const text = [
        `Hi ${name},`,
        "",
        `Your DBS Update Service status check is due on ${dueDate.toLocaleDateString("en-GB")} (${daysLeft} days).`,
        "Please make sure your £16/year DBS Update Service subscription is still active.",
        "Check: https://www.gov.uk/dbs-update-service",
        "",
        "— SpecialCarer",
      ].join("\n");
      const res = await sendEmail({ to: email, subject, html, text });
      if (res.ok) {
        await admin
          .from("background_checks")
          .update({ us_reminder_sent_at: now.toISOString() })
          .eq("id", row.id);
        sent += 1;
      } else {
        errors.push({ user_id: row.user_id, message: res.error });
      }
    } catch (e) {
      errors.push({
        user_id: row.user_id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}
