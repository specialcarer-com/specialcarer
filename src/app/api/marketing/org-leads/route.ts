import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { isFreeEmail } from "@/lib/org/types";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL =
  process.env.ORG_LEADS_EMAIL ?? process.env.ORG_ADMIN_EMAIL ?? "hello@specialcarer.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tiny in-memory rate limiter — 5 submissions per IP per hour. Ample
// for genuine users; blocks the obvious form-spammer pattern.
const HITS = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || cur.reset < now) {
    HITS.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (cur.count >= LIMIT) return false;
  cur.count += 1;
  return true;
}

type Body = {
  full_name?: string;
  work_email?: string;
  org_name?: string;
  role?: string;
  message?: string;
  source?: string;
  free_email_override?: boolean;
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
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const work_email = String(body.work_email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(work_email) || work_email.length > 200) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  // Free-webmail check: warn but allow when user has acknowledged.
  const free = isFreeEmail(work_email);
  if (free && !body.free_email_override) {
    return NextResponse.json(
      {
        ok: false,
        free_email: true,
        message:
          "That looks like a personal email. Use a work address, or tick 'Continue anyway'.",
      },
      { status: 400 },
    );
  }

  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;
  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("org_leads")
    .insert({
      full_name: body.full_name?.trim().slice(0, 120) || null,
      work_email,
      org_name: body.org_name?.trim().slice(0, 200) || null,
      role: body.role?.trim().slice(0, 120) || null,
      message: body.message?.trim().slice(0, 4000) || null,
      source: body.source?.trim().slice(0, 60) || "organisations_page",
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
    `Email: ${work_email}${free ? " (free webmail — flagged)" : ""}`,
    `Org: ${body.org_name ?? "—"}`,
    `Role: ${body.role ?? "—"}`,
    `Source: ${body.source ?? "organisations_page"}`,
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
