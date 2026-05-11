/**
 * Transactional email helpers for the timesheet flow. Best-effort — every
 * function here swallows errors and logs; the calling endpoint never fails
 * over an SMTP / notifications hiccup.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/smtp";
import type { PendingConfirmation } from "./approve";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(Math.max(0, cents) / 100).toFixed(2)}`;
}

const KIND_LABEL: Record<PendingConfirmation["kind"], string> = {
  overage: "Overage charge",
  overtime: "Overtime premium",
  tip: "Tip",
};

/**
 * Sent when the approve handler created supplemental PIs that couldn't be
 * captured off-session. The link drops the user back into the ConfirmSheet
 * at the Elements step so they can finalise from a phone bell / desktop
 * inbox without retyping a reason.
 *
 * Drops a `notifications` row too so the in-app bell shows a re-confirm
 * prompt even before the email lands.
 */
export async function sendResumePaymentEmail(args: {
  admin: AnySupabase;
  userId: string;
  bookingId: string;
  pendingConfirmations: PendingConfirmation[];
}): Promise<void> {
  const { admin, userId, bookingId, pendingConfirmations } = args;
  if (pendingConfirmations.length === 0) return;

  const total = pendingConfirmations.reduce(
    (sum, p) => sum + p.amount_cents,
    0,
  );
  const currency = pendingConfirmations[0]?.currency ?? "gbp";

  const link =
    (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      "https://specialcarer.com") +
    `/m/bookings/${bookingId}?resume_payment=1`;

  // In-app notification — fires even when SMTP fails.
  try {
    await admin.from("notifications").insert({
      user_id: userId,
      kind: "timesheet_payment_retry",
      title: "Finish confirming your payment",
      body: `${pendingConfirmations.length} charge${pendingConfirmations.length === 1 ? "" : "s"} still need one tap to confirm.`,
      link_url: `/m/bookings/${bookingId}?resume_payment=1`,
      payload: {
        booking_id: bookingId,
        pending_payment_ids: pendingConfirmations.map((p) => p.payment_id),
      },
    });
  } catch (e) {
    console.error("[timesheet.notify] notification insert failed", e);
  }

  // Look up the user's email.
  let email: string | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
  } catch (e) {
    console.error("[timesheet.notify] getUserById failed", e);
  }
  if (!email) return;

  const lineHtml = pendingConfirmations
    .map(
      (p) =>
        `<li style="margin:4px 0;font-size:14px;color:#2F2E31;">${KIND_LABEL[p.kind]}: <strong>${fmtMoney(p.amount_cents, p.currency)}</strong></li>`,
    )
    .join("");

  const subject = `Finish confirming your payment (${fmtMoney(total, currency)})`;
  const text = [
    "You approved your carer's timesheet but a couple of charges still need a quick tap to confirm.",
    "",
    "Outstanding:",
    ...pendingConfirmations.map(
      (p) => `  · ${KIND_LABEL[p.kind]}: ${fmtMoney(p.amount_cents, p.currency)}`,
    ),
    "",
    `Open: ${link}`,
    "",
    "If you've already confirmed in the app, you can ignore this email.",
    "",
    "— SpecialCarer",
  ].join("\n");

  const html = `
    <div style="font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2F2E31;">
      <p style="margin:0 0 4px;font-size:13px;color:#0E7C7B;font-weight:700;letter-spacing:0.04em;">FINISH CONFIRMING</p>
      <h1 style="margin:0 0 16px;font-size:22px;color:#171E54;">A couple of charges still need a tap</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#575757;">You approved the timesheet — these extras need one more confirmation to go through.</p>
      <ul style="margin:0 0 16px;padding-left:18px;">${lineHtml}</ul>
      <p style="margin:24px 0 0;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#0E7C7B;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">Confirm payment</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#A3A3A3;">If you&rsquo;ve already confirmed in the app, you can ignore this email.</p>
    </div>
  `;

  try {
    await sendEmail({ to: email, subject, html, text });
  } catch (e) {
    console.error("[timesheet.notify] sendEmail failed", e);
  }
}
