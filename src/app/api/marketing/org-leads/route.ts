import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { rateLimit, getRequestIp } from "@/lib/rate-limit";
import { validateLead, isGmail } from "@/lib/anti-spam/validate-lead";
import { logSpamAttempt, recordHoneypotHit } from "@/lib/anti-spam/log-attempt";

export const dynamic = "force-dynamic";

const SOURCE_FORM = "organisations_page";
const ADMIN_EMAIL =
  process.env.ORG_LEADS_EMAIL ?? process.env.ORG_ADMIN_EMAIL ?? "hello@specialcarers.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  full_name?: string;
  work_email?: string;
  org_name?: string;
  role?: string;
  message?: string;
  source?: string;
  /** Honeypot — must stay empty. Bots that fill every input will trip this. */
  website?: string;
  /**
   * Set true on resubmission after seeing the Gmail soft-block warning
   * (micro-charities/sole traders with no other email). Only ever
   * suppresses the Gmail-specific soft block.
   */
  use_personal_email?: boolean;
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * POST /api/marketing/org-leads
 *
 * Captures a lead from the /organisations landing page contact form.
 * Inserts a row using the service-role admin client (bypasses RLS),
 * then fires a best-effort ops notification email. No auth required.
 */
export async function POST(req: Request) {
  const ip = getRequestIp(req);
  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Rate-limit FIRST — cheap, no I/O, no DB write. A bot hammering this
  // endpoint hits its 429 before we ever touch the honeypot/validation/
  // DB-insert path. Previously the honeypot check ran first, so every
  // single bot request (the honeypot's exact target audience) triggered
  // an unconditional, un-throttled `spam_lead_attempts` insert — this
  // reordering closes that log-flooding gap (review finding).
  if (!rateLimit(`org-leads:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 })) {
    // Rate-limit rejections do NOT insert into spam_lead_attempts — the
    // rate limiter's whole point is to bound load, and logging every hit
    // here would defeat that.
    return NextResponse.json(
      { error: "rate_limited", message: "Too many submissions — please try again in an hour." },
      { status: 429 },
    );
  }

  // Honeypot: a real browser never fills this hidden field. Drop silently
  // (200 OK) so bots don't learn to look for it, but log the hit.
  if (String(body.website ?? "").trim().length > 0) {
    recordHoneypotHit(SOURCE_FORM);
    await logSpamAttempt({
      sourceForm: SOURCE_FORM,
      rejectionReason: "HONEYPOT_HIT",
      ipAddress: ip,
      userAgent: ua,
      payload: { ...body, website: "[REDACTED-HONEYPOT-VALUE]" },
    });
    return NextResponse.json({ ok: true });
  }

  const work_email = String(body.work_email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(work_email) || work_email.length > 200) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const check = validateLead({
    name: body.full_name,
    email: work_email,
    org: body.org_name,
    role: body.role,
    usePersonalEmail: body.use_personal_email === true,
  });
  if (!check.valid) {
    await logSpamAttempt({
      sourceForm: SOURCE_FORM,
      rejectionReason:
        check.reasonCode === "FREE_WEBMAIL" && check.soft
          ? "GMAIL_SOFT_WARNED"
          : check.reasonCode ?? "validation_failed",
      ipAddress: ip,
      userAgent: ua,
      payload: body,
    });
    return NextResponse.json(
      {
        ok: false,
        error: check.reasonCode,
        message: check.reason,
        soft: check.soft ?? false,
      },
      { status: 400 },
    );
  }

  // If this submission used the Gmail override, log it distinctly for
  // ops visibility (per-provider override usage) even though it's not a
  // rejection.
  if (body.use_personal_email === true && isGmail(work_email)) {
    await logSpamAttempt({
      sourceForm: SOURCE_FORM,
      rejectionReason: "GMAIL_OVERRIDE_USED",
      ipAddress: ip,
      userAgent: ua,
      payload: body,
    });
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("org_leads")
    .insert({
      full_name: body.full_name?.trim().slice(0, 120) || null,
      work_email,
      org_name: body.org_name?.trim().slice(0, 200) || null,
      role: body.role?.trim().slice(0, 120) || null,
      message: body.message?.trim().slice(0, 4000) || null,
      source: body.source?.trim().slice(0, 60) || SOURCE_FORM,
      user_agent: ua,
      ip_address: ip,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[org-leads] insert failed", error);
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  // Best-effort ops notification.
  const subject = `🆕 Org lead — ${body.org_name?.trim() || work_email}`;
  const lines = [
    `Lead from /organisations`,
    `Name: ${body.full_name ?? "—"}`,
    `Email: ${work_email}`,
    `Org: ${body.org_name ?? "—"}`,
    `Role: ${body.role ?? "—"}`,
    `Source: ${body.source ?? SOURCE_FORM}`,
    "",
    body.message ?? "(no message)",
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;">${escHtml(
    text,
  )}</pre>`;
  await sendEmail({
    to: ADMIN_EMAIL,
    subject,
    text,
    html,
    replyTo: work_email,
  }).catch((e) => console.error("[org-leads] notify email failed", e));

  return NextResponse.json({ ok: true, lead_id: inserted.id });
}
