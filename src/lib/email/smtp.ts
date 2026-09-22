/**
 * Transactional email transport for SpecialCarer.
 *
 * PRIMARY: Resend HTTP API (deliverability + dedicated transactional infra).
 *   - RESEND_API_KEY      (required for Resend path)
 *   - EMAIL_FROM          (default: "SpecialCarer Ops <ops@specialcarer.com>")
 *
 * FALLBACK: IONOS SMTP (used only if RESEND_API_KEY is missing).
 *   - IONOS_SMTP_HOST  (default: smtp.ionos.co.uk)
 *   - IONOS_SMTP_PORT  (default: 587)
 *   - IONOS_SMTP_USER
 *   - IONOS_SMTP_PASS
 *
 * This module is import-compatible with the previous nodemailer-only
 * version: callers continue to use sendEmail({ to, subject, html, text,
 * replyTo }) and get back { ok, messageId|error }. The transport is
 * picked at first use and cached.
 *
 * Calls are no-ops in environments where neither transport is
 * configured — we log a warning rather than throwing.
 */

import "server-only";
import type { Transporter } from "nodemailer";
import { Resend } from "resend";
import { isCloudflareWorkersRuntime } from "@/lib/hosting/runtime";

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

const DEFAULT_FROM = "SpecialCarer Ops <ops@specialcarer.com>";

let cachedResend: Resend | null = null;

function getResend(): Resend | null {
  if (cachedResend) return cachedResend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cachedResend = new Resend(key);
  return cachedResend;
}

let cachedSmtp: Transporter | null = null;
let warnedSmtpUnavailableOnCloudflare = false;

async function getSmtp(): Promise<Transporter | null> {
  if (cachedSmtp) return cachedSmtp;

  if (isCloudflareWorkersRuntime()) {
    // Nodemailer's SMTP transport needs raw TCP/TLS sockets, which the
    // Workers runtime does not provide the way Node.js does — this is a
    // fundamental runtime limitation, not a missing config value, and it
    // is never going to work here. Resend (HTTP-based) is the only
    // supported transport on Cloudflare. The nodemailer import below is
    // dynamic specifically so this branch (which always runs first on
    // Cloudflare) never triggers it, keeping nodemailer's own code out of
    // any bundling concern on this runtime as well as out of the runtime
    // failure path.
    if (!warnedSmtpUnavailableOnCloudflare) {
      warnedSmtpUnavailableOnCloudflare = true;
      console.warn(
        "[email] SMTP fallback is unavailable on Cloudflare Workers (no raw TCP sockets) — configure RESEND_API_KEY instead of relying on IONOS SMTP here",
      );
    }
    return null;
  }

  const host = process.env.IONOS_SMTP_HOST ?? "smtp.ionos.co.uk";
  const port = Number(process.env.IONOS_SMTP_PORT ?? "587");
  const user = process.env.IONOS_SMTP_USER;
  const pass = process.env.IONOS_SMTP_PASS;
  if (!user || !pass) return null;

  const { default: nodemailer } = await import("nodemailer");
  cachedSmtp = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS upgrade
    auth: { user, pass },
  });
  return cachedSmtp;
}

async function sendViaResend(
  resend: Resend,
  input: SendEmailInput,
  from: string,
): Promise<SendEmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (error) {
      console.error("[email] resend send error", error);
      return {
        ok: false,
        error: typeof error === "string" ? error : (error.message ?? "Resend send failed"),
      };
    }
    return { ok: true, messageId: data?.id ?? "resend" };
  } catch (err) {
    console.error("[email] resend threw", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Resend send failed",
    };
  }
}

async function sendViaSmtp(
  smtp: Transporter,
  input: SendEmailInput,
  from: string,
): Promise<SendEmailResult> {
  try {
    const info = await smtp.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[email] smtp send failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;

  // Prefer Resend.
  const resend = getResend();
  if (resend) {
    return sendViaResend(resend, input, from);
  }

  // Fallback to IONOS SMTP.
  const smtp = await getSmtp();
  if (smtp) {
    return sendViaSmtp(smtp, input, from);
  }

  console.warn(
    "[email] No transport configured (need RESEND_API_KEY or IONOS_SMTP_USER/PASS) — email not sent",
  );
  return { ok: false, error: "Email transport is not configured" };
}
