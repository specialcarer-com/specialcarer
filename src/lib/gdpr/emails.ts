/**
 * SpecialCarer — self-service account-deletion email templates
 * (Phase C — PR C5).
 *
 * Mirrors the style of src/lib/dsar/emails.ts (brand palette, table
 * shell, plain-text fallback). Kept in a separate module because the
 * DSAR-specific copy explicitly names Article 15/16/17/20 whereas the
 * self-service flow is user-initiated deletion where the user might not
 * think of themselves as "exercising Article 17".
 */

const BRAND_PRIMARY = "#039EA0";
const BRAND_HEADING = "#171E54";
const BRAND_MUTED = "#575757";

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
        This email confirms a request you made in your SpecialCarer account settings.
        If you did not make this request, ignore this email — the request will expire in 24 hours and no data will be deleted.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The verification email a user receives after clicking "Delete my
 * account" in the danger-zone page. 24-hour TTL, single-use link.
 */
export function renderAccountDeletionVerifyEmail(args: {
  subject_email: string;
  verify_url: string;
}): { subject: string; html: string; text: string } {
  const inner = `
      <tr><td style="padding-bottom:12px;color:${BRAND_HEADING};font-size:18px;font-weight:600;">
        Confirm your account deletion
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        You asked us to delete your SpecialCarer account. To confirm,
        click the link below within <strong>24 hours</strong>. If you
        do not click, nothing will happen — the request expires and
        your account stays exactly as it is.
      </td></tr>
      <tr><td style="padding:8px 0 20px 0;">
        <a href="${args.verify_url}"
           style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;text-decoration:none;
                  padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">
          Confirm deletion
        </a>
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:13px;line-height:1.55;color:${BRAND_MUTED};">
        Or paste this link into your browser:<br>
        <span style="word-break:break-all;">${args.verify_url}</span>
      </td></tr>
      <tr><td style="padding-bottom:8px;font-size:14px;line-height:1.55;">
        Once you confirm, your profile, contact details, and preferences
        are erased on the next processing run (usually within an hour).
        A few records are held under UK law (accounting for six years,
        safeguarding records for six years) — the completion email lists
        every category with its retention date.
      </td></tr>`;
  const text = `Confirm your SpecialCarer account deletion

You asked us to delete your SpecialCarer account (${args.subject_email}).

Confirm within 24 hours: ${args.verify_url}

If you did not make this request, ignore this email — the request will expire and your account stays exactly as it is.

Once you confirm, your profile, contact details, and preferences are erased on the next processing run. A few records are held under UK law (accounting six years, safeguarding six years) — the completion email lists every category with its retention date.

— SpecialCarer`;
  return {
    subject: "Confirm your SpecialCarer account deletion",
    html: shell(inner, "Confirm your account deletion"),
    text,
  };
}

/**
 * Sent after the cron worker successfully runs the erasure handler on
 * the user's data. Renders the same nulled + retained breakdown as
 * renderDsarErasedEmail so the two flows produce identical audit
 * disclosures.
 */
export function renderAccountDeletionCompleteEmail(args: {
  subject_email: string;
  job_id: string;
  nulled: { label: string; row_count: number }[];
  retained: {
    label: string;
    legal_basis: string;
    retained_until: string | null;
  }[];
  max_retained_until: string | null;
  digest: string;
}): { subject: string; html: string; text: string } {
  const nulledList = args.nulled.length
    ? args.nulled
        .map(
          (n) =>
            `<li>${escapeHtml(n.label)}${n.row_count > 0 ? ` (${n.row_count} row${n.row_count === 1 ? "" : "s"})` : ""}</li>`,
        )
        .join("")
    : "<li>No fields required nulling in this environment.</li>";

  const retainedList = args.retained.length
    ? args.retained
        .map(
          (r) =>
            `<li><strong>${escapeHtml(r.label)}</strong> — ${escapeHtml(r.legal_basis)}${r.retained_until ? ` (until ${escapeHtml(r.retained_until)})` : ""}</li>`,
        )
        .join("")
    : "<li>Nothing was retained.</li>";

  const inner = `
      <tr><td style="padding-bottom:12px;color:${BRAND_HEADING};font-size:18px;font-weight:600;">
        Your account has been deleted
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        We have processed your deletion request (reference
        <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f2f2;padding:1px 6px;border-radius:4px;">${escapeHtml(args.job_id)}</code>).
        You can no longer sign in with ${escapeHtml(args.subject_email)}.
      </td></tr>
      <tr><td style="padding-bottom:8px;color:${BRAND_HEADING};font-size:15px;font-weight:600;">
        What we have erased
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        <ul style="margin:0;padding-left:18px;">${nulledList}</ul>
      </td></tr>
      <tr><td style="padding-bottom:8px;color:${BRAND_HEADING};font-size:15px;font-weight:600;">
        What we are required to keep, and for how long
      </td></tr>
      <tr><td style="padding-bottom:12px;font-size:14px;line-height:1.55;">
        UK law requires us to retain certain records for a defined
        period even after you delete your account. These are held under
        Article 17(3)(b) (compliance with a legal obligation).
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        <ul style="margin:0;padding-left:18px;">${retainedList}</ul>
      </td></tr>
      ${
        args.max_retained_until
          ? `<tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        The latest date on which any of your data will be held is
        <strong>${escapeHtml(args.max_retained_until)}</strong>. When
        each retention period ends, the records are automatically
        deleted by our systems.
      </td></tr>`
          : ""
      }
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        Audit fingerprint (for your records):
        <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f2f2;padding:1px 6px;border-radius:4px;">${escapeHtml(args.digest)}</code>.
      </td></tr>`;

  const nulledText = args.nulled.length
    ? args.nulled
        .map(
          (n) =>
            `  - ${n.label}${n.row_count > 0 ? ` (${n.row_count} row${n.row_count === 1 ? "" : "s"})` : ""}`,
        )
        .join("\n")
    : "  - No fields required nulling in this environment.";

  const retainedText = args.retained.length
    ? args.retained
        .map(
          (r) =>
            `  - ${r.label} — ${r.legal_basis}${r.retained_until ? ` (until ${r.retained_until})` : ""}`,
        )
        .join("\n")
    : "  - Nothing was retained.";

  const text = `Your SpecialCarer account has been deleted

Reference ${args.job_id}. You can no longer sign in with ${args.subject_email}.

What we have erased:
${nulledText}

What we are required to keep, and for how long:
${retainedText}
${args.max_retained_until ? `\nLatest retention date: ${args.max_retained_until}.\n` : ""}
Audit fingerprint: ${args.digest}.

— SpecialCarer
Data Protection: dpo@specialcarer.com`;

  return {
    subject: "Your SpecialCarer account has been deleted",
    html: shell(inner, "Your account has been deleted"),
    text,
  };
}
