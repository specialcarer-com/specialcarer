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

export function renderDsarConfirmationEmail(args: {
  subject_email: string;
  request_type: string;
}): { subject: string; html: string; text: string } {
  // Sent when an authenticated user submits a DSAR from /settings/data.
  // Because the session already proves ownership of the email address
  // we skip the "click to confirm" step, but we still send this so the
  // subject has a paper trail — matches Article 12(3) UK GDPR (confirm
  // receipt).
  const typeLabel =
    REQUEST_TYPE_LABEL[args.request_type] ?? args.request_type;
  const inner = `
      <tr><td style="padding-bottom:12px;color:${BRAND_HEADING};font-size:18px;font-weight:600;">
        We received your ${typeLabel}
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        Because you submitted this request while signed in as
        <strong>${args.subject_email}</strong> we have already verified your
        identity — no confirmation link is needed. We aim to respond within
        one calendar month (Article 12(3) UK GDPR).
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;color:${BRAND_MUTED};">
        You can review the status of this request at any time from
        <strong>Settings &rarr; Your data</strong> inside SpecialCarer.
      </td></tr>`;
  const text = `We received your ${typeLabel}

Because you submitted this request while signed in as ${args.subject_email} we have already verified your identity — no confirmation link is needed. We aim to respond within one calendar month (Article 12(3) UK GDPR).

You can review the status of this request at any time from Settings > Your data inside SpecialCarer.
— SpecialCarer`;
  return {
    subject: `We received your SpecialCarer ${typeLabel}`,
    html: shell(inner, `We received your ${typeLabel}`),
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDsarRejectedEmail(args: {
  subject_email: string;
  request_type: string;
  reason: string;
  support_email?: string;
}): { subject: string; html: string; text: string } {
  const typeLabel =
    REQUEST_TYPE_LABEL[args.request_type] ?? args.request_type;
  const supportEmail = args.support_email ?? "privacy@specialcarer.com";
  const reasonHtml = escapeHtml(args.reason).replace(/\n/g, "<br>");
  const inner = `
      <tr><td style="padding-bottom:12px;color:${BRAND_HEADING};font-size:18px;font-weight:600;">
        We could not action your ${typeLabel}
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        We received a ${typeLabel} against the email address
        <strong>${args.subject_email}</strong> but were unable to action it. The reason is
        below.
      </td></tr>
      <tr><td style="padding:0 0 16px 0;">
        <div style="border-left:3px solid ${BRAND_PRIMARY};padding:12px 16px;background:#F7F7F9;
                    color:${BRAND_HEADING};font-size:15px;line-height:1.55;">
          ${reasonHtml}
        </div>
      </td></tr>
      <tr><td style="padding-bottom:8px;font-size:14px;line-height:1.55;">
        You have the right to challenge this decision. Reply to this email, or
        contact <a href="mailto:${supportEmail}" style="color:${BRAND_PRIMARY};">${supportEmail}</a>
        with any supporting information (for example proof of identity or an
        authority to act on behalf of another person). You can also complain to
        the Information Commissioner's Office at
        <a href="https://ico.org.uk/make-a-complaint/" style="color:${BRAND_PRIMARY};">ico.org.uk</a>.
      </td></tr>`;
  const text = `We could not action your ${typeLabel}

We received a ${typeLabel} for ${args.subject_email} but were unable to action it.

Reason:
${args.reason}

You have the right to challenge this decision. Reply to this email, or contact ${supportEmail} with any supporting information (for example proof of identity or an authority to act on behalf of another person). You can also complain to the Information Commissioner's Office at https://ico.org.uk/make-a-complaint/.

— SpecialCarer`;
  return {
    subject: `Your SpecialCarer ${typeLabel}`,
    html: shell(inner, `We could not action your ${typeLabel}`),
    text,
  };
}

// --------------------------------------------------------------------------
// Erasure completion email (Article 17)
// --------------------------------------------------------------------------

export type DsarErasedEmailArgs = {
  subject_email: string;
  request_id: string;
  nulled: { label: string; row_count: number }[];
  retained: {
    label: string;
    legal_basis: string;
    retained_until: string | null;
  }[];
  max_retained_until: string | null;
  digest: string;
};

/**
 * Renders the Article-17 completion email. The wording matches the
 * template in `specialcarer_dsar_erasure_retention_map.md` §6 — every
 * change here must also update that spec, and vice-versa.
 */
export function renderDsarErasedEmail(
  args: DsarErasedEmailArgs,
): { subject: string; html: string; text: string } {
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
        Your erasure request — completed
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:15px;line-height:1.55;">
        We have processed your erasure request (reference
        <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f2f2;padding:1px 6px;border-radius:4px;">${escapeHtml(args.request_id)}</code>)
        under Article 17 of the UK GDPR. This email sets out exactly what we
        have done and what we are required to keep.
      </td></tr>
      <tr><td style="padding-bottom:8px;color:${BRAND_HEADING};font-size:15px;font-weight:600;">
        What we have erased today
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        <ul style="margin:0;padding-left:18px;">${nulledList}</ul>
      </td></tr>
      <tr><td style="padding-bottom:8px;color:${BRAND_HEADING};font-size:15px;font-weight:600;">
        What we are required to keep, and for how long
      </td></tr>
      <tr><td style="padding-bottom:12px;font-size:14px;line-height:1.55;">
        UK law requires us to retain certain records for a defined period
        even after you exercise your right to erasure. These are held under
        Article 17(3)(b) (compliance with a legal obligation) and
        Article 17(3)(e) (establishment, exercise or defence of legal claims).
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        <ul style="margin:0;padding-left:18px;">${retainedList}</ul>
      </td></tr>
      ${
        args.max_retained_until
          ? `<tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        When each retention period ends, the records will be automatically
        deleted by our systems. The latest date on which any of your data
        will be held is <strong>${escapeHtml(args.max_retained_until)}</strong>.
      </td></tr>`
          : ""
      }
      <tr><td style="padding-bottom:8px;color:${BRAND_HEADING};font-size:15px;font-weight:600;">
        The audit trail
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        We keep a record of the fact that you asked for erasure and of what
        we did in response, so we can prove to the Information Commissioner's
        Office that your request was honoured. This audit record is retained
        for six years. The audit fingerprint for your request is
        <code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f2f2;padding:1px 6px;border-radius:4px;">${escapeHtml(args.digest)}</code>.
      </td></tr>
      <tr><td style="padding-bottom:8px;color:${BRAND_HEADING};font-size:15px;font-weight:600;">
        If you disagree
      </td></tr>
      <tr><td style="padding-bottom:16px;font-size:14px;line-height:1.55;">
        If you believe we should have erased more than we did, you can
        (1) reply to this email and we will re-review, (2) email
        <a href="mailto:complaints@specialcarer.com" style="color:${BRAND_PRIMARY};">complaints@specialcarer.com</a>,
        or (3) complain to the Information Commissioner's Office at
        <a href="https://ico.org.uk/make-a-complaint/" style="color:${BRAND_PRIMARY};">ico.org.uk/make-a-complaint</a>
        or on 0303 123 1113.
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

  const text = `Your erasure request — completed

We have processed your erasure request (reference ${args.request_id}) under Article 17 of the UK GDPR.

What we have erased today:
${nulledText}

What we are required to keep, and for how long:
UK law requires us to retain certain records for a defined period even after you exercise your right to erasure, under Article 17(3)(b) and Article 17(3)(e).
${retainedText}
${args.max_retained_until ? `\nThe latest date on which any of your data will be held is ${args.max_retained_until}.\n` : ""}
The audit trail:
We keep a record of the fact that you asked for erasure and of what we did in response. This audit record is retained for six years. Audit fingerprint: ${args.digest}.

If you disagree:
(1) reply to this email, (2) email complaints@specialcarer.com, or (3) complain to the ICO at https://ico.org.uk/make-a-complaint/ or on 0303 123 1113.

— SpecialCarer
All Care 4 U Group Ltd, trading as Special Carer
Data Protection: dpo@specialcarer.com`;

  return {
    subject: "Your SpecialCarer erasure request — completed",
    html: shell(inner, "Your erasure request — completed"),
    text,
  };
}
