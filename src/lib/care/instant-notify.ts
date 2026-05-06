import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";

type Args = {
  bookingId: string;
  caregiverId: string;
  seekerId: string;
  startsAt: string;
  endsAt: string;
  serviceType: string;
  locationCity?: string;
  totalCents: number;
  currency: "gbp" | "usd";
};

const SERVICE_LABEL: Record<string, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special-needs",
  postnatal: "Postnatal & newborn",
  complex_care: "Complex care",
};

function fmtMoney(cents: number, currency: "gbp" | "usd") {
  const sym = currency === "usd" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Notify a caregiver that a family has just placed an instant booking
 * request. We do TWO things, both best-effort and isolated:
 *
 *   1. Insert a row into `public.notifications` so the dashboard / mobile
 *      bell shows the alert next time the carer opens the app.
 *   2. Send a transactional email via IONOS SMTP with a deep-link to
 *      the booking detail page so the carer can confirm/decline fast.
 *
 * We intentionally do NOT throw on any branch — instant booking is a
 * conversion-critical path and a flaky SMTP shouldn't break checkout.
 */
export async function notifyCarerInstantBooking(args: Args) {
  const admin = createAdminClient();

  const service = SERVICE_LABEL[args.serviceType] ?? args.serviceType;
  const when = fmtDateTime(args.startsAt);
  const total = fmtMoney(args.totalCents, args.currency);
  const where = args.locationCity ? ` in ${args.locationCity}` : "";

  // 1) Insert dashboard notification row.
  try {
    await admin.from("notifications").insert({
      user_id: args.caregiverId,
      kind: "instant_booking_request",
      title: "⚡ New instant booking",
      body: `${service}${where} · starts ${when} · ${total}`,
      link_url: `/dashboard/bookings/${args.bookingId}`,
      payload: {
        booking_id: args.bookingId,
        seeker_id: args.seekerId,
        starts_at: args.startsAt,
        ends_at: args.endsAt,
        service_type: args.serviceType,
        total_cents: args.totalCents,
        currency: args.currency,
      },
    });
  } catch (err) {
    console.error("[instant-notify] insert notification failed", err);
  }

  // 2) Send the carer an email. Look up their email via auth admin.
  try {
    const { data: userRow } = await admin.auth.admin.getUserById(
      args.caregiverId,
    );
    const email = userRow?.user?.email;
    if (!email) return;

    const subject = `⚡ Instant booking request — ${service}, ${when}`;
    const link =
      (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
        "https://specialcarer.com") +
      `/dashboard/bookings/${args.bookingId}`;

    const text = [
      `You have a new instant booking request.`,
      ``,
      `Service: ${service}`,
      `When:    ${when}`,
      where ? `Where:   ${args.locationCity}` : null,
      `Pay:     ${total}`,
      ``,
      `Confirm or decline here:`,
      link,
      ``,
      `If you don't respond soon, the request will go to the next nearest carer.`,
      ``,
      `— SpecialCarer`,
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2F2E31;">
        <p style="margin:0 0 4px;font-size:13px;color:#039EA0;font-weight:700;letter-spacing:0.04em;">⚡ INSTANT BOOKING</p>
        <h1 style="margin:0 0 16px;font-size:22px;color:#171E54;">New request — ${service}</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#575757;">A family near you needs care right now. Tap below to confirm or decline.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;font-size:13px;color:#575757;width:90px;">When</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${when}</td></tr>
          ${args.locationCity ? `<tr><td style="padding:6px 0;font-size:13px;color:#575757;">Where</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${args.locationCity}</td></tr>` : ""}
          <tr><td style="padding:6px 0;font-size:13px;color:#575757;">Service</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${service}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#575757;">Total</td><td style="padding:6px 0;font-size:14px;color:#2F2E31;font-weight:600;">${total}</td></tr>
        </table>
        <p style="margin:24px 0 0;">
          <a href="${link}" style="display:inline-block;padding:12px 20px;background:#039EA0;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">View &amp; confirm</a>
        </p>
        <p style="margin:24px 0 0;font-size:12px;color:#A3A3A3;">If you don't respond soon, the request will go to the next nearest carer.</p>
      </div>
    `;

    await sendEmail({ to: email, subject, html, text });
  } catch (err) {
    console.error("[instant-notify] send email failed", err);
  }
}
