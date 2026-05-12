/**
 * Phase 2: email templates for Channel B carer agency opt-in flow.
 *
 * Brand colours: #0E7C7B teal, #F4A261 accent. Font: Plus Jakarta Sans.
 * Sent via Resend (see src/lib/email/smtp.ts).
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#F7FAFA;margin:0;padding:24px;color:#2F2E31">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
  <h2 style="color:#0E7C7B;margin:0 0 8px">${esc(title)}</h2>
  ${bodyHtml}
  <p style="font-size:11px;color:#575757;margin-top:24px">
    SpecialCarer · A product of All Care 4 U Group Ltd<br>
    <a href="https://specialcarer.com" style="color:#0E7C7B">specialcarer.com</a>
  </p>
</div></body></html>`;
}

const DASHBOARD_URL = "https://specialcarer.com/dashboard/agency-optin";

export type EmailContent = { subject: string; html: string; text: string };

export function renderOptInStartedEmail(args: { name: string }): EmailContent {
  const subject = "You've started your agency opt-in";
  const html = shell(
    "You're on your way",
    `<p>Hi ${esc(args.name)},</p>
    <p>You've started your application to take <strong>Channel B agency shifts</strong> — bookings that come directly from organisations who use SpecialCarer.</p>
    <p>You'll need to clear four gates: a worker agreement, an Enhanced DBS, a Right to Work check, and three mandatory training courses.</p>
    <p style="margin:24px 0">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Continue your application
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "You've started your application to take Channel B agency shifts on SpecialCarer.",
    "Four gates to clear: worker agreement, Enhanced DBS, Right to Work, training.",
    "",
    `Continue: ${DASHBOARD_URL}`,
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderGateCompleteEmail(args: {
  name: string;
  gateLabel: string;
  remaining: number;
}): EmailContent {
  const subject =
    args.remaining > 0
      ? `${args.gateLabel} cleared — ${args.remaining} step${args.remaining === 1 ? "" : "s"} to go`
      : `${args.gateLabel} cleared — you're ready to submit`;
  const cta =
    args.remaining > 0
      ? "See what's left"
      : "Submit for review";
  const html = shell(
    `${args.gateLabel} cleared`,
    `<p>Hi ${esc(args.name)},</p>
    <p>Your <strong>${esc(args.gateLabel)}</strong> step is now complete.</p>
    <p>${
      args.remaining > 0
        ? `You have <strong>${args.remaining}</strong> step${args.remaining === 1 ? "" : "s"} left before you can submit for review.`
        : `All four gates are green. Head back to your dashboard and submit for admin review — you'll typically hear back within 24 hours.`
    }</p>
    <p style="margin:24px 0">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        ${cta}
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    `Your "${args.gateLabel}" step is complete.`,
    args.remaining > 0
      ? `${args.remaining} step${args.remaining === 1 ? "" : "s"} remaining.`
      : "All four gates are green — submit for review.",
    "",
    DASHBOARD_URL,
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOptInSubmittedEmail(args: { name: string }): EmailContent {
  const subject = "We've received your agency opt-in — pending review";
  const html = shell(
    "Pending admin review",
    `<p>Hi ${esc(args.name)},</p>
    <p>All four gates are green and your application is now in the admin queue. We aim to review every submission within <strong>24 hours</strong>.</p>
    <p>You'll receive another email once a decision is made.</p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "All four gates are green — your application is now with the admin team. We review within 24 hours.",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOptInApprovedEmail(args: { name: string }): EmailContent {
  const subject = "You're live for agency shifts";
  const html = shell(
    "Welcome to Channel B",
    `<p>Hi ${esc(args.name)},</p>
    <p>Great news — your agency opt-in has been approved. You're now eligible to receive Channel B shifts dispatched by organisational clients.</p>
    <p>Shifts will appear in your usual jobs feed alongside marketplace bookings, tagged "Agency".</p>
    <p style="margin:24px 0">
      <a href="https://specialcarer.com/m/jobs" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open jobs feed
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "Your agency opt-in has been approved. Channel B shifts will appear in your jobs feed.",
    "",
    "https://specialcarer.com/m/jobs",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOptInRejectedEmail(args: {
  name: string;
  reason: string;
}): EmailContent {
  const subject = "Your agency opt-in was not approved";
  const html = shell(
    "Application not approved",
    `<p>Hi ${esc(args.name)},</p>
    <p>We were unable to approve your agency opt-in at this time. The reviewing admin left this note:</p>
    <blockquote style="border-left:3px solid #F4A261;padding:8px 12px;color:#575757;background:#FBFAF7;margin:16px 0">${esc(args.reason)}</blockquote>
    <p>You can address the issue and re-apply — your marketplace status is unaffected.</p>
    <p style="margin:24px 0">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open application
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "Your agency opt-in was not approved.",
    "",
    `Reason: ${args.reason}`,
    "",
    `You can re-apply at ${DASHBOARD_URL}`,
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOptInPausedEmail(args: {
  name: string;
  reason: string;
}): EmailContent {
  const subject = "Your agency status has been paused";
  const html = shell(
    "Agency status paused",
    `<p>Hi ${esc(args.name)},</p>
    <p>Your eligibility for Channel B shifts has been paused while we look into the following:</p>
    <blockquote style="border-left:3px solid #F4A261;padding:8px 12px;color:#575757;background:#FBFAF7;margin:16px 0">${esc(args.reason)}</blockquote>
    <p>Your marketplace bookings are unaffected. We'll be in touch with next steps shortly.</p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "Your agency status has been paused.",
    `Reason: ${args.reason}`,
    "Marketplace bookings are unaffected.",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderComplianceUpdateGraceEmail(args: {
  name: string;
}): EmailContent {
  const subject = "Compliance update: 30 days to complete two new courses";
  const html = shell(
    "New mandatory training",
    `<p>Hi ${esc(args.name)},</p>
    <p>Our compliance policy has expanded. To keep your Channel B agency status active, you must complete <strong>two new mandatory courses</strong> within the next 30 days:</p>
    <ul>
      <li>Food Hygiene</li>
      <li>Medication Administration</li>
    </ul>
    <p>Carers working with children must also complete the new <strong>Safeguarding Children</strong> course.</p>
    <p>You'll continue receiving agency shifts during the 30-day grace period. After that, missing courses will move your status to <em>gates pending</em> until they're complete.</p>
    <p style="margin:24px 0">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open training
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "Our compliance policy has expanded. You have 30 days to complete:",
    "  · Food Hygiene",
    "  · Medication Administration",
    "Carers working with children must also complete Safeguarding Children.",
    "",
    `Open training: ${DASHBOARD_URL}`,
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOptInGraceExpiredEmail(args: {
  name: string;
}): EmailContent {
  const subject = "Action required: agency status paused";
  const html = shell(
    "Grace period expired",
    `<p>Hi ${esc(args.name)},</p>
    <p>Your 30-day compliance grace period has ended and you have outstanding mandatory training. Your agency status has been moved to <strong>gates pending</strong> — you will not be offered Channel B shifts until you complete the remaining courses.</p>
    <p>Your marketplace bookings are unaffected.</p>
    <p style="margin:24px 0">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open application
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "Your 30-day grace period has ended. Agency status moved to 'gates pending' until you complete the mandatory training.",
    "Marketplace bookings are unaffected.",
    "",
    `Open application: ${DASHBOARD_URL}`,
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOptInResumedEmail(args: { name: string }): EmailContent {
  const subject = "You're live for agency shifts again";
  const html = shell(
    "Agency status resumed",
    `<p>Hi ${esc(args.name)},</p>
    <p>Your eligibility for Channel B shifts has been restored. You'll start receiving agency offers again from now on.</p>
    <p style="margin:24px 0">
      <a href="https://specialcarer.com/m/jobs" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open jobs feed
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.name},`,
    "",
    "Your agency status has been resumed. Channel B offers will appear in your jobs feed again.",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}
