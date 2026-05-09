/**
 * Plain HTML email templates for SpecialCarer transactional emails.
 *
 * Templates are inlined-CSS so they render in major mail clients.
 * Brand: primary #039EA0, navy heading #171E54.
 */

// Family PII masking helpers live in a shared module so they can be reused
// across email templates, carer-facing API responses, admin dashboards,
// etc. See src/lib/privacy/mask.ts for the lifecycle rule and rationale.
import { maskAddress, maskEmail, maskPhone } from "@/lib/privacy/mask";

const BRAND_PRIMARY = "#039EA0";
const BRAND_HEADING = "#171E54";
const BRAND_SUBHEAD = "#575757";
const BG_PALE = "#F7FAFA";
const BRAND_LOGO_URL = "https://specialcarer.com/brand/logo-wordmark-email.png";
// Full SpecialCarer wordmark logo (icon + "Special Carer" text, all teal,
// transparent background). Source 960x721, rendered at 240x180 in email
// (@4x retina). Aspect ratio 161:121.

/**
 * Branded email header with the SpecialCarer logo mark + wordmark.
 * Uses absolute https URL for the logo (required by all major mail
 * clients). The wordmark text is always rendered next to the image so
 * the brand still reads even when the recipient's client blocks remote
 * images by default.
 *
 * @param eyebrow Optional uppercase tag-line shown under the wordmark
 *                (e.g. "OPS", "FAMILY", "PAYMENTS"). Omit for none.
 */
function renderBrandHeader(eyebrow?: string): string {
  const eyebrowMarkup = eyebrow
    ? `<tr>
            <td align="center" valign="top" class="sc-pad-x" style="padding:6px 28px 0 28px;background:#ffffff;">
              <div style="font-size:12px;letter-spacing:2px;color:${BRAND_PRIMARY};font-weight:700;text-transform:uppercase;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escape(eyebrow)}</div>
            </td>
          </tr>`
    : "";
  // Full SpecialCarer wordmark logo (icon + "Special Carer" text). Image is
  // 960×721 served as @4x retina; rendered at 240×180 in client. The wordmark
  // is part of the image so we no longer render a separate text wordmark below.
  // Aspect ratio 161:121 → height = round(width * 121/161).
  return `<tr>
            <td align="center" valign="top" class="sc-pad-x sc-logo-cell" style="padding:36px 28px 0 28px;background:#ffffff;line-height:0;">
              <img src="${BRAND_LOGO_URL}" width="240" height="180" alt="SpecialCarer" border="0" style="display:block;border:0;outline:none;text-decoration:none;width:240px;height:180px;max-width:240px;-ms-interpolation-mode:bicubic;">
            </td>
          </tr>
          ${eyebrowMarkup}
          <tr>
            <td class="sc-pad-x" style="padding:18px 28px 0 28px;background:#ffffff;">
              <div style="height:1px;background:#E6F0EF;width:100%;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>`;
}

function escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type FamilyInviteEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Render the family-sharing invite email.
 *
 * @param inviterName  Display name of the primary user
 * @param familyName   Optional family name (e.g. "The Smith family")
 * @param acceptUrl    Full magic-link URL to the accept page
 * @param expiresAt    ISO timestamp the link stops working
 */
export function renderFamilyInviteEmail(args: {
  inviterName: string;
  familyName?: string | null;
  acceptUrl: string;
  expiresAt: string;
  recipientName?: string | null;
}): FamilyInviteEmail {
  const { inviterName, familyName, acceptUrl, expiresAt, recipientName } = args;
  const safeInviter = escape(inviterName);
  const safeFamily = familyName ? escape(familyName) : null;
  const safeRecipient = recipientName ? escape(recipientName) : null;
  const expires = new Date(expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const subject = safeFamily
    ? `${safeInviter} invited you to ${safeFamily} on SpecialCarer`
    : `${safeInviter} invited you to their family on SpecialCarer`;

  const greeting = safeRecipient ? `Hi ${safeRecipient},` : "Hi,";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${BG_PALE};font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_HEADING};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PALE};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          ${renderBrandHeader()}
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:1.25;color:${BRAND_HEADING};font-weight:700;">You've been invited to a family on SpecialCarer</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;color:${BRAND_SUBHEAD};font-size:15px;line-height:1.55;">
              <p style="margin:0 0 12px 0;">${greeting}</p>
              <p style="margin:0 0 12px 0;"><strong style="color:${BRAND_HEADING};">${safeInviter}</strong> has invited you${safeFamily ? ` to <strong style="color:${BRAND_HEADING};">${safeFamily}</strong>` : ""} on SpecialCarer.</p>
              <p style="margin:0 0 12px 0;">As a family member you'll be able to see care journal updates, upcoming visits, and chats — so the whole family stays in the loop. You won't be charged or share account access.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px 8px 32px;">
              <a href="${acceptUrl}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;font-size:15px;">Accept invitation</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;color:${BRAND_SUBHEAD};font-size:13px;line-height:1.5;">
              <p style="margin:8px 0 0 0;">This link expires on <strong>${expires}</strong>. If you weren't expecting this email you can safely ignore it.</p>
              <p style="margin:8px 0 0 0;word-break:break-all;color:#8a8a8a;font-size:12px;">If the button doesn't work, paste this link into your browser:<br>${acceptUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#C2E5E4;color:#2F2E31;font-size:12px;line-height:1.5;text-align:center;">
              SpecialCarer · A product of All Care 4 U Group Ltd<br>
              <a href="https://specialcarer.com" style="color:#2F2E31;">specialcarer.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${greeting}

${inviterName} has invited you${familyName ? ` to ${familyName}` : ""} on SpecialCarer.

As a family member you'll be able to see care journal updates, upcoming visits, and chats. You won't be charged or share account access.

Accept the invitation:
${acceptUrl}

This link expires on ${expires}. If you weren't expecting this email you can safely ignore it.

— SpecialCarer
A product of All Care 4 U Group Ltd
https://specialcarer.com
`;

  return { subject, html, text };
}

export type LiveInAdminEmail = {
  subject: string;
  html: string;
  text: string;
};

const SERVICE_LABELS: Record<string, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

function labelService(key: string): string {
  return SERVICE_LABELS[key] ?? key.replace(/_/g, " ");
}

function fmtMoney(cents: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : "£";
  const whole = Math.round(cents / 100);
  return `${symbol}${whole.toLocaleString("en-GB")}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Render the live-in care request admin notification.
 * Sent to the ops inbox whenever a family submits /book/live-in.
 */
export function renderLiveInAdminEmail(args: {
  requestId: string;
  service: string;
  country: "GB" | "US";
  startDate: string;
  weeks: number;
  address: string;
  notes?: string | null;
  contactEmail: string;
  contactPhone?: string | null;
  dailyRateCents: number;
  totalCents: number;
  currency: string;
  userId?: string | null;
  adminUrl?: string;
}): LiveInAdminEmail {
  const serviceLabel = labelService(args.service);
  const subject = `New live-in request — ${serviceLabel} (${args.country})`;
  const safeService = escape(serviceLabel);
  // Privacy: mask family PII until a carer accepts the booking.
  // The reply-to header (set on the outbound email) preserves the real
  // family email so ops can still reply via their mail client —
  // they just don’t see the address, full phone, or full email in
  // the body of the notification card.
  const maskedAddress = maskAddress(args.address, args.country);
  const safeAddress = escape(maskedAddress);
  const safeNotes = args.notes ? escape(args.notes) : "";
  const safeEmail = escape(maskEmail(args.contactEmail));
  const safePhone = args.contactPhone
    ? escape(maskPhone(args.contactPhone))
    : "";
  const safeUser = args.userId ? escape(args.userId) : "";
  const totalLabel = fmtMoney(args.totalCents, args.currency);
  const dailyLabel = fmtMoney(args.dailyRateCents, args.currency);
  const startLabel = fmtDate(args.startDate);
  const adminUrl = args.adminUrl ?? "https://specialcarer.com/admin/live-in";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escape(subject)}</title>
<style>
  /* Mobile responsive: shrink card padding + font sizes for narrow screens.
     iOS Mail honours @media (max-width). */
  @media only screen and (max-width: 480px) {
    .sc-card { width:100% !important; max-width:100% !important; border-radius:0 !important; }
    .sc-pad-x { padding-left:18px !important; padding-right:18px !important; }
    .sc-pad-x-sm { padding-left:14px !important; padding-right:14px !important; }
    .sc-h1 { font-size:20px !important; line-height:1.25 !important; }
    .sc-total { font-size:22px !important; }
    .sc-total-meta { display:block !important; margin-top:4px !important; }
    .sc-row-label { width:auto !important; padding-right:10px !important; white-space:nowrap; }
    .sc-outer-pad { padding:16px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BG_PALE};font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_HEADING};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PALE};">
    <tr>
      <td align="center" class="sc-outer-pad" style="padding:24px 12px;">
        <table role="presentation" class="sc-card" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          ${renderBrandHeader("Ops")}
          <tr>
            <td class="sc-pad-x" style="padding:0 28px 8px 28px;">
              <h1 class="sc-h1" style="margin:0;font-size:24px;line-height:1.25;color:${BRAND_HEADING};font-weight:700;">New live-in request</h1>
              <p style="margin:6px 0 0 0;color:${BRAND_SUBHEAD};font-size:14px;line-height:1.45;">${safeService} · ${args.country} · starts ${escape(startLabel)}</p>
            </td>
          </tr>
          <tr>
            <td class="sc-pad-x" style="padding:18px 28px 4px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PALE};border-radius:12px;">
                <tr><td class="sc-pad-x-sm" style="padding:14px 18px 4px 18px;color:${BRAND_SUBHEAD};font-size:12px;letter-spacing:0.5px;text-transform:uppercase;font-weight:700;">Indicative total</td></tr>
                <tr><td class="sc-pad-x-sm" style="padding:0 18px 14px 18px;color:${BRAND_HEADING};font-size:26px;font-weight:700;line-height:1.2;"><span style="white-space:nowrap;">${totalLabel}</span> <span class="sc-total-meta" style="color:${BRAND_SUBHEAD};font-size:13px;font-weight:500;">· ${args.weeks} weeks × 7 days × ${dailyLabel}/day</span></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="sc-pad-x" style="padding:16px 28px 8px 28px;color:${BRAND_HEADING};font-size:14px;line-height:1.55;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};width:120px;vertical-align:top;">Service</td><td style="padding:6px 0;font-weight:600;word-break:break-word;">${safeService}</td></tr>
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Country</td><td style="padding:6px 0;font-weight:600;">${args.country}</td></tr>
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Start date</td><td style="padding:6px 0;font-weight:600;word-break:break-word;">${escape(startLabel)}</td></tr>
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Duration</td><td style="padding:6px 0;font-weight:600;">${args.weeks} week${args.weeks === 1 ? "" : "s"}</td></tr>
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">${args.country === "GB" ? "Postcode" : "ZIP"}</td><td style="padding:6px 0;font-weight:600;word-break:break-word;">${safeAddress}</td></tr>
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Contact email</td><td style="padding:6px 0;font-weight:600;word-break:break-all;">${safeEmail}</td></tr>
                ${safePhone ? `<tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Contact phone</td><td style="padding:6px 0;font-weight:600;">${safePhone}</td></tr>` : ""}
                ${safeNotes ? `<tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Notes</td><td style="padding:6px 0;font-weight:500;line-height:1.55;word-break:break-word;">${safeNotes}</td></tr>` : ""}
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Request ID</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;color:#8a8a8a;word-break:break-all;">${escape(args.requestId)}</td></tr>
                <tr><td class="sc-row-label" style="padding:6px 12px 6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">User</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;color:#8a8a8a;word-break:break-all;">${safeUser || "(anonymous — not signed in)"}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" class="sc-pad-x" style="padding:22px 28px 8px 28px;">
              <a href="${escape(adminUrl)}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:999px;font-size:15px;">Open admin dashboard</a>
            </td>
          </tr>
          <tr>
            <td class="sc-pad-x" style="padding:10px 28px 6px 28px;color:${BRAND_SUBHEAD};font-size:13px;line-height:1.55;">
              <p style="margin:0;padding:10px 14px;background:#FFF7E6;border-left:3px solid #E0A92F;border-radius:6px;color:#5C4A1B;"><strong style="color:#5C4A1B;">Privacy:</strong> the family’s full address, phone, and email are masked until a carer accepts this request. Hit <strong>Reply</strong> to message them — their address is set as reply-to.</p>
            </td>
          </tr>
          <tr>
            <td class="sc-pad-x" style="padding:16px 28px;background:#C2E5E4;color:#2F2E31;font-size:12px;line-height:1.5;text-align:center;">
              SpecialCarer · A product of All Care 4 U Group Ltd<br>
              <a href="https://specialcarer.com" style="color:#2F2E31;">specialcarer.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const postcodeLabel = args.country === "GB" ? "Postcode" : "ZIP";
  const text = `New live-in request — ${serviceLabel} (${args.country})

Indicative total: ${totalLabel} (${args.weeks} weeks × 7 days × ${dailyLabel}/day)

Service: ${serviceLabel}
Country: ${args.country}
Start date: ${startLabel}
Duration: ${args.weeks} week${args.weeks === 1 ? "" : "s"}
${postcodeLabel}: ${maskedAddress}
Contact email: ${maskEmail(args.contactEmail)}
Contact phone: ${args.contactPhone ? maskPhone(args.contactPhone) : "(not provided)"}
Notes: ${args.notes || "(none)"}
Request ID: ${args.requestId}
User ID: ${args.userId ?? "(anonymous — not signed in)"}

Open admin dashboard: ${adminUrl}

Privacy: the family’s full address, phone, and email are masked until a carer accepts. Reply directly to this email to reach the family — the reply-to header is set to their address.

— SpecialCarer
A product of All Care 4 U Group Ltd
https://specialcarer.com
`;

  return { subject, html, text };
}


// ─── Reference invitation email ──────────────────────────────────
//
// Sent by /api/carer/references when a carer adds a referee. The
// referee follows the link to /r/[token] and submits the form. The
// link expires in 14 days (enforced server-side).

export type ReferenceInviteEmail = {
  refereeName: string;
  carerName: string;
  link: string;
  expiresAtIso: string;
};

function escapeRefHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderReferenceInviteEmail(args: ReferenceInviteEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${args.carerName} has listed you as a reference on SpecialCarer`;
  const expires = new Date(args.expiresAtIso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const html = `<!DOCTYPE html>
<html><body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#F7FAFA;margin:0;padding:24px;color:#2F2E31">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
  <h2 style="color:#0E7C7B;margin:0 0 8px">Reference request</h2>
  <p>Hi ${escapeRefHtml(args.refereeName)},</p>
  <p>${escapeRefHtml(args.carerName)} has applied to provide care on SpecialCarer and has listed you as one of their references.</p>
  <p>Could you take 2 minutes to vouch for them? It really helps families know who they're inviting into their homes.</p>
  <p style="margin:24px 0">
    <a href="${args.link}" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
      Open the reference form
    </a>
  </p>
  <p style="font-size:12px;color:#575757;margin-top:24px">
    This link expires on <strong>${expires}</strong>. If you don't recognise the carer named, please ignore this email — no action is needed.
  </p>
  <hr style="border:none;border-top:1px solid #E9ECEC;margin:24px 0">
  <p style="font-size:12px;color:#575757">
    Why you're seeing this: ${escapeRefHtml(args.carerName)} entered your email address as a reference on SpecialCarer's vetting form. We never share your email and only use it for this single message.
  </p>
  <p style="font-size:11px;color:#575757;margin-top:24px">
    SpecialCarer · A product of All Care 4 U Group Ltd<br>
    <a href="https://specialcarer.com" style="color:#0E7C7B">specialcarer.com</a>
  </p>
</div></body></html>`;

  const text = [
    `Hi ${args.refereeName},`,
    "",
    `${args.carerName} has applied to provide care on SpecialCarer and has listed you as a reference.`,
    "",
    "Open the reference form:",
    args.link,
    "",
    `This link expires on ${expires}.`,
    "",
    "If you don't recognise this carer, please ignore this email.",
    "",
    "— SpecialCarer",
  ].join("\n");

  return { subject, html, text };
}

// ─── Organisation lifecycle emails ─────────────────────────────
//
// Sent during Phase A of the organisation user type:
//   • renderOrgSubmittedEmail — booker confirmation after step 8
//   • renderOrgApprovedEmail — sent on /admin/orgs approve
//   • renderOrgRejectedEmail — sent on /admin/orgs reject
//   • renderOrgRequestInfoEmail — sent on "Request more info"
//   • renderOrgAdminNotifyEmail — heads-up to ops for new submissions

function escOrgHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function orgShell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#F7FAFA;margin:0;padding:24px;color:#2F2E31">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
  <h2 style="color:#0E7C7B;margin:0 0 8px">${escOrgHtml(title)}</h2>
  ${bodyHtml}
  <p style="font-size:11px;color:#575757;margin-top:24px">
    SpecialCarer · A product of All Care 4 U Group Ltd<br>
    <a href="https://specialcarer.com" style="color:#0E7C7B">specialcarer.com</a>
  </p>
</div></body></html>`;
}

export function renderOrgSubmittedEmail(args: {
  bookerName: string;
  legalName: string;
}): { subject: string; html: string; text: string } {
  const subject = `We've received your SpecialCarer organisation application`;
  const html = orgShell(
    "Application received",
    `<p>Hi ${escOrgHtml(args.bookerName)},</p>
    <p>Thanks — we've received the verification details for <strong>${escOrgHtml(args.legalName)}</strong>.</p>
    <p>We aim to verify within <strong>2 business days</strong>. In the meantime you can browse carers and save shortlists from your dashboard; bookings unlock the moment we confirm your documents.</p>
    <p style="margin:24px 0">
      <a href="https://specialcarer.com/m/org" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Open your dashboard
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.bookerName},`,
    "",
    `Thanks — we've received the verification details for ${args.legalName}.`,
    "",
    "We aim to verify within 2 business days.",
    "",
    "Dashboard: https://specialcarer.com/m/org",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOrgApprovedEmail(args: {
  bookerName: string;
  legalName: string;
}): { subject: string; html: string; text: string } {
  const subject = `Your SpecialCarer organisation account is verified`;
  const html = orgShell(
    "You're verified — start booking",
    `<p>Hi ${escOrgHtml(args.bookerName)},</p>
    <p>Welcome aboard. <strong>${escOrgHtml(args.legalName)}</strong> is now verified on SpecialCarer.</p>
    <p>You can book any of our DBS / Checkr-cleared carers directly from your dashboard. Pricing stays at the same UK / US standard rates — no setup fees, no contracts.</p>
    <p style="margin:24px 0">
      <a href="https://specialcarer.com/m/org/carers" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Browse carers
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.bookerName},`,
    "",
    `${args.legalName} is now verified on SpecialCarer. You can book carers directly from your dashboard.`,
    "",
    "Browse carers: https://specialcarer.com/m/org/carers",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOrgRejectedEmail(args: {
  bookerName: string;
  legalName: string;
  reason: string;
}): { subject: string; html: string; text: string } {
  const subject = `We need a few changes to your SpecialCarer organisation account`;
  const html = orgShell(
    "We can't approve yet",
    `<p>Hi ${escOrgHtml(args.bookerName)},</p>
    <p>Thanks for submitting <strong>${escOrgHtml(args.legalName)}</strong>. We can't approve it just yet — here's what we need:</p>
    <blockquote style="margin:16px 0;padding:12px 16px;background:#F7FAFA;border-left:4px solid #0E7C7B;color:#2F2E31;white-space:pre-wrap">${escOrgHtml(args.reason)}</blockquote>
    <p>Once you've updated your details and re-uploaded any missing documents, we'll review again within 2 business days.</p>
    <p style="margin:24px 0">
      <a href="https://specialcarer.com/m/org/documents" style="display:inline-block;background:#0E7C7B;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:9999px;font-weight:700">
        Re-upload documents
      </a>
    </p>`,
  );
  const text = [
    `Hi ${args.bookerName},`,
    "",
    `We can't approve ${args.legalName} just yet — here's what we need:`,
    "",
    args.reason,
    "",
    "Re-upload: https://specialcarer.com/m/org/documents",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOrgRequestInfoEmail(args: {
  bookerName: string;
  legalName: string;
  message: string;
}): { subject: string; html: string; text: string } {
  const subject = `We need additional information for your SpecialCarer organisation account`;
  const html = orgShell(
    "Quick follow-up",
    `<p>Hi ${escOrgHtml(args.bookerName)},</p>
    <p>To finish verifying <strong>${escOrgHtml(args.legalName)}</strong> we'd appreciate a bit more info:</p>
    <blockquote style="margin:16px 0;padding:12px 16px;background:#F7FAFA;border-left:4px solid #0E7C7B;color:#2F2E31;white-space:pre-wrap">${escOrgHtml(args.message)}</blockquote>
    <p>Reply directly to this email or upload anything we need from your dashboard.</p>`,
  );
  const text = [
    `Hi ${args.bookerName},`,
    "",
    `To finish verifying ${args.legalName} we need:`,
    "",
    args.message,
    "",
    "Dashboard: https://specialcarer.com/m/org/documents",
    "",
    "— SpecialCarer",
  ].join("\n");
  return { subject, html, text };
}

export function renderOrgAdminNotifyEmail(args: {
  legalName: string;
  country: string;
  orgType: string;
  bookerEmail: string;
  orgId: string;
}): { subject: string; html: string; text: string } {
  const subject = `🆕 Org submission: ${args.legalName} (${args.country})`;
  const adminUrl = `https://specialcarer.com/admin/orgs/${args.orgId}`;
  const html = orgShell(
    "New organisation submission",
    `<ul style="line-height:1.6;color:#2F2E31">
      <li><strong>${escOrgHtml(args.legalName)}</strong></li>
      <li>${escOrgHtml(args.country)} · ${escOrgHtml(args.orgType)}</li>
      <li>Booker: ${escOrgHtml(args.bookerEmail)}</li>
    </ul>
    <p style="margin:16px 0">
      <a href="${adminUrl}" style="display:inline-block;background:#171E54;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:700">
        Review in admin
      </a>
    </p>`,
  );
  const text = [
    `${args.legalName} (${args.country})`,
    `Type: ${args.orgType}`,
    `Booker: ${args.bookerEmail}`,
    "",
    `Review: ${adminUrl}`,
  ].join("\n");
  return { subject, html, text };
}
