/**
 * Phase 2.1 — one-shot compliance blast for carers in the 30-day grace
 * period. Tells them which mandatory courses are still required given
 * their works_with_adults / works_with_children flags, and the exact
 * deadline by which they need to complete them or risk being paused.
 */

import { sendEmail, type SendEmailResult } from "./smtp";

const TEAL = "#0E7C7B";
const ACCENT = "#F4A261";
const TEXT = "#2F2E31";
const MUTED = "#5A6068";
const BG = "#F7FAFA";

const COURSE_LABEL: Record<string, string> = {
  "manual-handling": "Manual handling",
  "infection-control": "Infection control",
  "food-hygiene": "Food hygiene",
  "medication-administration": "Medication administration",
  "safeguarding-adults": "Safeguarding adults",
  "safeguarding-children": "Safeguarding children",
};

export interface GracePeriodBlastInput {
  /** Carer's full name; used in greeting */
  fullName: string;
  /** Carer's email */
  email: string;
  /** Slugs of mandatory courses they still need to complete */
  missingCourses: string[];
  /** ISO date string by which they must complete (grace-period end) */
  graceEndsAt: string;
  /** Whether the carer is set up to work with adults */
  worksWithAdults: boolean;
  /** Whether the carer is set up to work with children */
  worksWithChildren: boolean;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderHtml(i: GracePeriodBlastInput): string {
  const populationLine = (() => {
    if (i.worksWithAdults && i.worksWithChildren) {
      return "You're registered to work with <strong>both adults and children</strong>.";
    }
    if (i.worksWithChildren) {
      return "You're registered to work with <strong>children</strong>.";
    }
    return "You're registered to work with <strong>adults</strong>.";
  })();

  const courseRows = i.missingCourses
    .map(
      (slug) => `
        <tr>
          <td style="padding:10px 12px;border-top:1px solid #E5E9E9">
            <span style="color:${TEXT};font-weight:600">${COURSE_LABEL[slug] ?? slug}</span>
          </td>
          <td style="padding:10px 12px;border-top:1px solid #E5E9E9;text-align:right">
            <a href="https://specialcarer.com/dashboard/training/${slug}" style="color:${TEAL};text-decoration:none;font-weight:600">Start &rsaquo;</a>
          </td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:'Plus Jakarta Sans',Arial,sans-serif;background:${BG};margin:0;padding:24px;color:${TEXT}">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
    <div style="background:${TEAL};color:#FFFFFF;padding:18px 24px;border-radius:12px;margin-bottom:24px">
      <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.9">Compliance update</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">Action needed: 2 new mandatory courses</div>
    </div>

    <p style="margin:0 0 16px">Hi ${i.fullName},</p>

    <p style="margin:0 0 16px">We've updated SpecialCarer's mandatory training to bring it in line with current CQC and Ofsted guidance. ${populationLine}</p>

    <p style="margin:0 0 16px">You've been given a <strong style="color:${ACCENT}">30-day grace period</strong> so you can keep working in the meantime. Your Channel B opt-in stays active until <strong>${fmtDate(i.graceEndsAt)}</strong>.</p>

    <div style="background:${BG};border-radius:12px;padding:20px;margin:24px 0">
      <div style="font-size:13px;color:${MUTED};letter-spacing:0.5px;text-transform:uppercase;margin-bottom:12px">Courses you still need to pass</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        ${courseRows}
      </table>
    </div>

    <p style="margin:0 0 20px;color:${MUTED};font-size:14px">If you don't complete these by your deadline, your Channel B (organisation) bookings will be paused until you do. Your individual-client (marketplace) work is unaffected.</p>

    <p style="margin:32px 0">
      <a href="https://specialcarer.com/dashboard/agency-optin" style="display:inline-block;background:${TEAL};color:#FFFFFF;text-decoration:none;padding:14px 24px;border-radius:9999px;font-weight:700">
        Go to training dashboard
      </a>
    </p>

    <p style="margin:24px 0 0;color:${MUTED};font-size:13px">Questions? Reply to this email or contact compliance@specialcarer.com.</p>
    <p style="margin:8px 0 0;color:${MUTED};font-size:13px">— The SpecialCarer team</p>
  </div>
</body></html>`;
}

function renderText(i: GracePeriodBlastInput): string {
  const lines = [
    `Hi ${i.fullName},`,
    "",
    "We've updated SpecialCarer's mandatory training to bring it in line with current CQC and Ofsted guidance.",
    "",
    `You've been given a 30-day grace period so you can keep working. Your Channel B opt-in stays active until ${fmtDate(i.graceEndsAt)}.`,
    "",
    "Courses you still need to pass:",
    ...i.missingCourses.map(
      (slug) =>
        `  • ${COURSE_LABEL[slug] ?? slug} — https://specialcarer.com/dashboard/training/${slug}`,
    ),
    "",
    "If you don't complete these by your deadline, your Channel B (organisation) bookings will be paused. Your individual-client work is unaffected.",
    "",
    "Go to your training dashboard:",
    "https://specialcarer.com/dashboard/agency-optin",
    "",
    "Questions? Reply to this email or contact compliance@specialcarer.com.",
    "— The SpecialCarer team",
  ];
  return lines.join("\n");
}

export async function sendGracePeriodBlast(
  input: GracePeriodBlastInput,
): Promise<SendEmailResult> {
  if (input.missingCourses.length === 0) {
    return { ok: false, error: "No missing courses; nothing to send" };
  }
  const subject = `Action needed by ${fmtDate(input.graceEndsAt)}: ${input.missingCourses.length} mandatory course${input.missingCourses.length === 1 ? "" : "s"}`;
  return sendEmail({
    to: input.email,
    subject,
    html: renderHtml(input),
    text: renderText(input),
  });
}

/**
 * Plain renderers exposed for testing + previewing.
 */
export const _renderGracePeriodBlastHtml = renderHtml;
export const _renderGracePeriodBlastText = renderText;
