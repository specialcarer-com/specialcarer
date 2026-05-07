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
 * Privacy: mask the family's full address before the carer is matched/
 * accepted. Only the postcode (UK) or ZIP (US) is shown until acceptance.
 * Falls back to a generic “city, country” hint if no postcode is parseable.
 */
function maskAddress(address: string, country: "GB" | "US"): string {
  if (!address) return "(not provided)";
  const trimmed = address.trim();
  if (country === "GB") {
    // UK postcode pattern (covers e.g. SW1A 1AA, NW1 9XB, EC1V 9HX,
    // M1 1AE, B33 8TH, CR2 6XH, DN55 1PT). Match anywhere in string.
    const m = trimmed.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
    if (m) return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
  } else {
    // US ZIP (5-digit or ZIP+4)
    const m = trimmed.match(/\b(\d{5})(-\d{4})?\b/);
    if (m) return m[0];
  }
  // Last-ditch fallback: show only the last comma-separated chunk
  // (commonly the postcode/state) to avoid revealing street + city.
  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "(masked until accepted)";
}

/**
 * Privacy: mask all but the last 4 digits of the contact phone number.
 * Preserves the international dialling prefix (+44, +1) so ops still know
 * which country to expect. e.g. "+44 7700 900123" → "+44 •••• •••0123".
 */
function maskPhone(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Pull out leading + and country code (1–3 digits)
  const cc = trimmed.match(/^\+\d{1,3}/);
  // Strip everything that isn't a digit
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 4) return "\u2022".repeat(digits.length);
  const last4 = digits.slice(-4);
  const prefix = cc ? `${cc[0]} ` : "";
  return `${prefix}\u2022\u2022\u2022\u2022 \u2022\u2022\u2022${last4}`;
}

/**
 * Privacy: mask the local part of an email address. Show first character
 * + last character, mask the middle. Domain is preserved so ops can see
 * if the family is on a personal vs corporate domain. e.g.
 * "jane.doe@gmail.com" → "j••••••e@gmail.com".
 */
function maskEmail(raw: string): string {
  if (!raw) return "";
  const at = raw.indexOf("@");
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  if (local.length <= 2) return `${local[0] || ""}\u2022${domain}`;
  return `${local[0]}\u2022\u2022\u2022\u2022\u2022\u2022${local[local.length - 1]}${domain}`;
}

/**
 * Privacy: mask all but the first 8 characters of a UUID so ops can still
 * eyeball-correlate rows in the admin dashboard, without exposing the
 * full identifier in plain-text email.
 */
function maskId(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 8)}\u2026`;
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

