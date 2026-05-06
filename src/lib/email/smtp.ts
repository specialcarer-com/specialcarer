/**
 * IONOS SMTP transport for transactional email.
 *
 * Uses nodemailer with STARTTLS on port 587. Credentials come from env:
 *   IONOS_SMTP_HOST  (default: smtp.ionos.co.uk)
 *   IONOS_SMTP_PORT  (default: 587)
 *   IONOS_SMTP_USER  (e.g. noreply@specialcarer.com)
 *   IONOS_SMTP_PASS
 *   EMAIL_FROM       (default: "SpecialCarer <noreply@specialcarer.com>")
 *
 * Calls are no-ops in environments where credentials are missing — we
 * log a warning rather than throwing, so dev / preview deploys without
 * SMTP secrets keep working.
 */

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.IONOS_SMTP_HOST ?? "smtp.ionos.co.uk";
  const port = Number(process.env.IONOS_SMTP_PORT ?? "587");
  const user = process.env.IONOS_SMTP_USER;
  const pass = process.env.IONOS_SMTP_PASS;

  if (!user || !pass) {
    console.warn(
      "[email] IONOS_SMTP_USER / IONOS_SMTP_PASS missing — emails will not be sent"
    );
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS upgrade
    auth: { user, pass },
  });
  return cachedTransporter;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "Email transport is not configured" };
  }

  const from =
    process.env.EMAIL_FROM ?? "SpecialCarer <noreply@specialcarer.com>";

  try {
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[email] send failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}
