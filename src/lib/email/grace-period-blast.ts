/**
 * Phase 2.1 — one-shot compliance blast for carers in the 30-day grace
 * period. Tells them which mandatory courses are still required given
 * their works_with_adults / works_with_children flags, and the exact
 * deadline by which they need to complete them or risk being paused.
 *
 * The HTML/text template rendering lives in ./grace-period-blast-templates
 * (pure functions, no ./smtp import) so it can be unit-tested without
 * pulling in the email-transport module-scope imports. See that file's
 * header comment for why this split exists.
 */

import { sendEmail, type SendEmailResult } from "./smtp";
import {
  renderGracePeriodBlastHtml,
  renderGracePeriodBlastText,
  type GracePeriodBlastInput,
} from "./grace-period-blast-templates";

export type { GracePeriodBlastInput };

function fmtSubjectDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function sendGracePeriodBlast(
  input: GracePeriodBlastInput,
): Promise<SendEmailResult> {
  if (input.missingCourses.length === 0) {
    return { ok: false, error: "No missing courses; nothing to send" };
  }
  const subject = `Action needed by ${fmtSubjectDate(input.graceEndsAt)}: ${input.missingCourses.length} mandatory course${input.missingCourses.length === 1 ? "" : "s"}`;
  return sendEmail({
    to: input.email,
    subject,
    html: renderGracePeriodBlastHtml(input),
    text: renderGracePeriodBlastText(input),
  });
}

/**
 * Plain renderers exposed for testing + previewing. Kept here (re-exported
 * from the templates module) so any existing importers of these names from
 * this file keep working unchanged.
 */
export const _renderGracePeriodBlastHtml = renderGracePeriodBlastHtml;
export const _renderGracePeriodBlastText = renderGracePeriodBlastText;
