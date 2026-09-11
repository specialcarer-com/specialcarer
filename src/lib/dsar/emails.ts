/**
 * SpecialCarer — DSAR transactional email templates.
 *
 * Kept minimal — matching the brand ({@link BRAND_PRIMARY}, wordmark)
 * without depending on the full template pipeline in
 * `src/lib/email/templates.ts` (which is family/reference specific).
 * A follow-up can promote these into the main template module once the
 * shape has settled.
 */

const BRAND_PRIMARY = "#039EA0";
const BRAND_HEADING = "#171E54";
const BRAND_MUTED = "#575757";

const REQUEST_TYPE_LABEL: Record<string, string> = {
  access: "access request (Article 15)",
  erasure: "erasure request (Article 17)",
  rectification: "rectification request (Article 16)",
  portability: "portability request (Article 20)",
};

function shell(inner: string, title: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f7f8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0"
      style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px 28px;">
      <tr><td style="padding-bottom:20px;">
        <span style="color:${BRAND_PRIMARY};font-weight:700;font-size:20px;letter-spacing:-0.01em;">SpecialCarer</span>
      </td></tr>
      ${inner}
      <tr><td style="padding-top:24px;border-top:1px solid #eee;color:${BRAND_MUTED};font-size:12px;line-height:1.5;">
        This email was sent by SpecialCarer in response to a data-subject request under the UK GDPR / Data Protection Act 2018.
        If you did not make this request, ignore this email — no action will be taken.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderDsarVerifyEmail(args: {
  subject_email: string;
  request_type: string;
  verify_url: string;
}): { subject: string; html: string; text: string } {
  const typeLabel =
    REQUEST_TYPE_LABEL[args.request_type] ?? args.request_type;
  const inner = `
      <tr><td style="padding-bottom:12px;color:${BRAND_HEADING};font-size:18px;font-weight:600;">
        Confirm your ${typeLabel}
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        We received a ${typeLabel} against the email address
        <strong>${args.subject_email}</strong>. Confirm it by clicking the link below within 24 hours.
      </td></tr>
      <tr><td style="padding:8px 0 20px 0;">
        <a href="${args.verify_url}"
           style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;
                  padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Confirm request
        </a>
      </td></tr>
      <tr><td style="padding-bottom:8px;font-size:13px;line-height:1.55;color:${BRAND_MUTED};">
        Or paste this link into your browser:<br>
        <span style="word-break:break-all;">${args.verify_url}</span>
      </td></tr>`;
  const text = `Confirm your ${typeLabel}

We received a ${typeLabel} for ${args.subject_email}.
Confirm within 24 hours: ${args.verify_url}

If you did not make this request, ignore this email — no action will be taken.
— SpecialCarer`;
  return {
    subject: `Confirm your SpecialCarer ${typeLabel}`,
    html: shell(inner, `Confirm your ${typeLabel}`),
    text,
  };
}

export function renderDsarDeliveredEmail(args: {
  subject_email: string;
  request_type: string;
  signed_url: string;
  expires_in_hours: number;
  digest: string;
}): { subject: string; html: string; text: string } {
  const typeLabel =
    REQUEST_TYPE_LABEL[args.request_type] ?? args.request_type;
  const inner = `
      <tr><td style="padding-bottom:12px;color:${BRAND_HEADING};font-size:18px;font-weight:600;">
        Your ${typeLabel} is ready
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        Your data export is ready to download. The link is valid for
        <strong>${args.expires_in_hours} hours</strong>. If it expires, reply to this email and we will re-issue it.
      </td></tr>
      <tr><td style="padding:8px 0 20px 0;">
        <a href="${args.signed_url}"
           style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;
                  padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Download export
        </a>
      </td></tr>
      <tr><td style="padding-bottom:8px;font-size:13px;line-height:1.55;color:${BRAND_MUTED};">
        Integrity digest (for your records): <code>${args.digest}</code>
      </td></tr>`;
  const text = `Your ${typeLabel} is ready.

Download (valid for ${args.expires_in_hours}h): ${args.signed_url}

Integrity digest: ${args.digest}
— SpecialCarer`;
  return {
    subject: `Your SpecialCarer ${typeLabel} is ready`,
    html: shell(inner, `Your ${typeLabel} is ready`),
    text,
  };
}
