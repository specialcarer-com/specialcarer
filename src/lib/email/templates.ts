/**
 * Plain HTML email templates for SpecialCarer transactional emails.
 *
 * Templates are inlined-CSS so they render in major mail clients.
 * Brand: primary #039EA0, navy heading #171E54.
 */

const BRAND_PRIMARY = "#039EA0";
const BRAND_HEADING = "#171E54";
const BRAND_SUBHEAD = "#575757";
const BG_PALE = "#F7FAFA";
const BRAND_LOGO_URL = "https://specialcarer.com/brand/icon-192.png";

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
    ? `<div style="font-size:11px;letter-spacing:1.5px;color:${BRAND_PRIMARY};font-weight:700;text-transform:uppercase;margin-top:4px;">${escape(eyebrow)}</div>`
    : "";
  return `<tr>
            <td style="padding:28px 32px 12px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="${BRAND_LOGO_URL}" width="40" height="40" alt="SpecialCarer" style="display:block;border:0;width:40px;height:40px;">
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:18px;color:${BRAND_HEADING};font-weight:700;letter-spacing:-0.2px;line-height:1;">SpecialCarer</div>
                    ${eyebrowMarkup}
                  </td>
                </tr>
              </table>
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
  const safeAddress = escape(args.address);
  const safeNotes = args.notes ? escape(args.notes) : "";
  const safeEmail = escape(args.contactEmail);
  const safePhone = args.contactPhone ? escape(args.contactPhone) : "";
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
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG_PALE};font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_HEADING};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PALE};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          ${renderBrandHeader("Ops")}
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:1.25;color:${BRAND_HEADING};font-weight:700;">New live-in request</h1>
              <p style="margin:6px 0 0 0;color:${BRAND_SUBHEAD};font-size:14px;">${safeService} · ${args.country} · starts ${escape(startLabel)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 4px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG_PALE};border-radius:12px;">
                <tr><td style="padding:14px 18px 6px 18px;color:${BRAND_SUBHEAD};font-size:12px;letter-spacing:0.5px;text-transform:uppercase;font-weight:700;">Indicative total</td></tr>
                <tr><td style="padding:0 18px 14px 18px;color:${BRAND_HEADING};font-size:28px;font-weight:700;">${totalLabel} <span style="color:${BRAND_SUBHEAD};font-size:13px;font-weight:500;">· ${args.weeks} weeks × 7 days × ${dailyLabel}/day</span></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 8px 32px;color:${BRAND_HEADING};font-size:14px;line-height:1.6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};width:130px;vertical-align:top;">Service</td><td style="padding:6px 0;font-weight:600;">${safeService}</td></tr>
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Country</td><td style="padding:6px 0;font-weight:600;">${args.country}</td></tr>
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Start date</td><td style="padding:6px 0;font-weight:600;">${escape(startLabel)}</td></tr>
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Duration</td><td style="padding:6px 0;font-weight:600;">${args.weeks} week${args.weeks === 1 ? "" : "s"}</td></tr>
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Address</td><td style="padding:6px 0;font-weight:600;">${safeAddress}</td></tr>
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Contact email</td><td style="padding:6px 0;font-weight:600;"><a href="mailto:${safeEmail}" style="color:${BRAND_PRIMARY};text-decoration:none;">${safeEmail}</a></td></tr>
                ${safePhone ? `<tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Contact phone</td><td style="padding:6px 0;font-weight:600;"><a href="tel:${safePhone}" style="color:${BRAND_PRIMARY};text-decoration:none;">${safePhone}</a></td></tr>` : ""}
                ${safeNotes ? `<tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Notes</td><td style="padding:6px 0;font-weight:500;line-height:1.55;">${safeNotes}</td></tr>` : ""}
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">Request ID</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;color:#8a8a8a;">${escape(args.requestId)}</td></tr>
                <tr><td style="padding:6px 0;color:${BRAND_SUBHEAD};vertical-align:top;">User</td><td style="padding:6px 0;font-family:ui-monospace,monospace;font-size:12px;color:#8a8a8a;">${safeUser || "(anonymous — not signed in)"}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 32px 8px 32px;">
              <a href="${escape(adminUrl)}" style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;font-size:15px;">Open admin dashboard</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;color:${BRAND_SUBHEAD};font-size:13px;line-height:1.5;">
              <p style="margin:8px 0 0 0;">Reply directly to this email to reach the family — the reply-to is set to ${safeEmail}.</p>
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

  const text = `New live-in request — ${serviceLabel} (${args.country})

Indicative total: ${totalLabel} (${args.weeks} weeks × 7 days × ${dailyLabel}/day)

Service: ${serviceLabel}
Country: ${args.country}
Start date: ${startLabel}
Duration: ${args.weeks} week${args.weeks === 1 ? "" : "s"}
Address: ${args.address}
Contact email: ${args.contactEmail}
Contact phone: ${args.contactPhone || "(not provided)"}
Notes: ${args.notes || "(none)"}
Request ID: ${args.requestId}
User ID: ${args.userId ?? "(anonymous — not signed in)"}

Open admin dashboard: ${adminUrl}

Reply directly to this email to reach the family.

— SpecialCarer
A product of All Care 4 U Group Ltd
https://specialcarer.com
`;

  return { subject, html, text };
}

