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
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              <div style="font-size:13px;letter-spacing:1.5px;color:${BRAND_PRIMARY};font-weight:700;text-transform:uppercase;">SpecialCarer</div>
            </td>
          </tr>
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
