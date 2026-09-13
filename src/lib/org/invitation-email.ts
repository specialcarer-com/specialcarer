/**
 * Organisation-invitation email template (Phase D — PR D1).
 *
 * Renders a Resend-compatible HTML + text pair. Kept pure (no I/O) so
 * the send route can call it, tests can snapshot the output, and the
 * template stays reviewable in isolation.
 *
 * Security discipline:
 *   - The raw token appears ONLY in `acceptUrl` (which the caller
 *     builds from `NEXT_PUBLIC_APP_URL` + the raw token). Nothing
 *     else in the payload includes it.
 *   - `logSafePayload()` returns an object suitable for observability
 *     dumps with the token replaced by "[redacted]" — the tests
 *     assert the raw token is nowhere in that output.
 */

export type InvitationEmailInput = {
  /** Organisation display name. */
  orgName: string;
  /** Human-readable inviter name (fallback to "an admin"). */
  inviterName: string;
  /** Role granted on accept. */
  role: "admin" | "booker" | "finance" | "viewer";
  /**
   * Full accept URL including the raw token — e.g.
   * `https://specialcarer.com/org/invitations/accept?token=…`. Caller
   * is responsible for URL-encoding + base assembly; this template
   * does not manipulate it beyond dropping it into the link.
   */
  acceptUrl: string;
  /** Absolute expiry timestamp — used to render "expires in N days". */
  expiresAt: Date;
};

export type InvitationEmailOutput = {
  subject: string;
  html: string;
  text: string;
};

const ROLE_LABELS: Record<InvitationEmailInput["role"], string> = {
  admin: "Admin (manage the team + bookings)",
  booker: "Booker (create bookings on behalf of the org)",
  finance: "Finance (view invoices + payments)",
  viewer: "Viewer (read-only dashboard access)",
};

/**
 * Minimal HTML-attribute-safe escape. The three character escapes
 * (`&`, `<`, `>`, `"`) are all that matter inside a paragraph or a
 * href-value context; we don't render into script/style contexts.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatExpiry(expiresAt: Date): string {
  const days = Math.max(
    1,
    Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
  const iso = expiresAt.toISOString().slice(0, 10);
  return `${days} day${days === 1 ? "" : "s"} (by ${iso})`;
}

export function renderInvitationEmail(
  input: InvitationEmailInput,
): InvitationEmailOutput {
  const roleLabel = ROLE_LABELS[input.role] ?? input.role;
  const expiryHuman = formatExpiry(input.expiresAt);

  const subject = `You've been invited to join ${input.orgName} on SpecialCarer`;

  const text = [
    `Hi,`,
    ``,
    `${input.inviterName} has invited you to join ${input.orgName} on SpecialCarer as ${roleLabel}.`,
    ``,
    `Accept the invitation here:`,
    input.acceptUrl,
    ``,
    `This link expires in ${expiryHuman}.`,
    ``,
    `If you weren't expecting this invitation, you can safely ignore this email — nothing will change.`,
    ``,
    `— The SpecialCarer team`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">You've been invited to join ${escapeHtml(input.orgName)}</h1>
    <p style="line-height: 1.5;">
      ${escapeHtml(input.inviterName)} has invited you to join
      <strong>${escapeHtml(input.orgName)}</strong> on SpecialCarer as
      <strong>${escapeHtml(roleLabel)}</strong>.
    </p>
    <p style="line-height: 1.5;">
      <a href="${escapeHtml(input.acceptUrl)}" style="display: inline-block; background: #0f6cbd; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-weight: 600;">Accept invitation</a>
    </p>
    <p style="line-height: 1.5; color: #555; font-size: 14px;">
      Or copy this link into your browser:<br>
      <span style="word-break: break-all;">${escapeHtml(input.acceptUrl)}</span>
    </p>
    <p style="line-height: 1.5; color: #555; font-size: 14px;">
      This link expires in ${escapeHtml(expiryHuman)}.
    </p>
    <p style="line-height: 1.5; color: #888; font-size: 12px; margin-top: 32px;">
      If you weren't expecting this invitation, you can safely ignore this email — nothing will change.
    </p>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Log-safe payload: strips the raw token from the accept URL, keeps
 * everything else the ops dashboard would need. Callers writing
 * observability lines / structured logs MUST use this rather than
 * dumping the input directly.
 */
export function logSafePayload(input: InvitationEmailInput): {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrlHost: string;
  expiresAt: string;
} {
  let acceptUrlHost = "";
  try {
    const parsed = new URL(input.acceptUrl);
    acceptUrlHost = `${parsed.protocol}//${parsed.host}${parsed.pathname}?token=[redacted]`;
  } catch {
    acceptUrlHost = "[unparseable-url]";
  }
  return {
    orgName: input.orgName,
    inviterName: input.inviterName,
    role: input.role,
    acceptUrlHost,
    expiresAt: input.expiresAt.toISOString(),
  };
}
