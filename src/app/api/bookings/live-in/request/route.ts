/**
 * POST /api/bookings/live-in/request
 *
 * Live-in care is a manual-match product. This endpoint records the
 * family's intent to book, computes the indicative total, sends an
 * admin email, and returns the request id. No payment is taken — admin
 * follows up by email/phone to match a carer and create the actual
 * booking via the admin tool later.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/smtp";
import {
  LIVE_IN_DAILY_RATES,
  liveInTotalCents,
  fmtCurrency,
  type Country,
} from "@/lib/pricing";

export const dynamic = "force-dynamic";

const SERVICE_KEYS = new Set<string>([
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
]);

const ADMIN_EMAIL =
  process.env.LIVE_IN_ADMIN_EMAIL ?? "hello@specialcarer.com";

type Body = {
  service?: string;
  start_date?: string;
  weeks?: number;
  address?: string;
  notes?: string;
  contact_email?: string;
  contact_phone?: string;
  country?: string;
};

function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const service = String(body.service ?? "").trim();
  const start_date = String(body.start_date ?? "").trim();
  const weeks = Number(body.weeks);
  const address = String(body.address ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  const contact_email = String(body.contact_email ?? "").trim().toLowerCase();
  const contact_phone = String(body.contact_phone ?? "").trim();
  const countryRaw = String(body.country ?? "GB").trim().toUpperCase();
  const country: Country = countryRaw === "US" ? "US" : "GB";

  if (!SERVICE_KEYS.has(service)) {
    return NextResponse.json(
      { ok: false, error: "invalid_service" },
      { status: 400 }
    );
  }
  if (!isISODate(start_date)) {
    return NextResponse.json(
      { ok: false, error: "invalid_start_date" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(weeks) || weeks < 1 || weeks > 52) {
    return NextResponse.json(
      { ok: false, error: "invalid_weeks" },
      { status: 400 }
    );
  }
  if (address.length < 4) {
    return NextResponse.json(
      { ok: false, error: "invalid_address" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  // Best-effort attribution to the signed-in user, but anonymous
  // submissions are allowed — admin can still email the contact back.
  let userId: string | null = null;
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const rate = LIVE_IN_DAILY_RATES[country];
  const total_cents = liveInTotalCents(weeks, country);

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("live_in_requests")
    .insert({
      user_id: userId,
      service,
      start_date,
      weeks: Math.round(weeks),
      address,
      notes: notes || null,
      contact_email,
      contact_phone: contact_phone || null,
      country,
      daily_rate_cents: rate.rate_cents,
      total_cents,
      currency: rate.currency,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[live-in] insert failed", error);
    return NextResponse.json(
      { ok: false, error: "insert_failed" },
      { status: 500 }
    );
  }

  // Best-effort admin notification — failures should not block the
  // success response (insert already succeeded).
  const subject = `New live-in request — ${service.replace("_", " ")} (${country})`;
  const lines = [
    `Request ID: ${inserted.id}`,
    `Service: ${service}`,
    `Country: ${country}`,
    `Start date: ${start_date}`,
    `Duration: ${weeks} weeks`,
    `Indicative total: ${fmtCurrency(total_cents, rate.currency)} (${weeks} × 7 × ${fmtCurrency(rate.rate_cents, rate.currency)}/day)`,
    `Address: ${address}`,
    `Contact email: ${contact_email}`,
    `Contact phone: ${contact_phone || "(not provided)"}`,
    `Notes: ${notes || "(none)"}`,
    `User ID: ${userId ?? "(anonymous)"}`,
  ];
  const text = lines.join("\n");
  const html = `<h2>${escapeHtml(subject)}</h2><pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;

  await sendEmail({
    to: ADMIN_EMAIL,
    subject,
    text,
    html,
    replyTo: contact_email,
  }).catch((e) => {
    console.error("[live-in] admin email failed", e);
  });

  return NextResponse.json({ ok: true, request_id: inserted.id });
}
