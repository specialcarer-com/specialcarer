export const MAX_REFERENCE_RESENDS_PER_DAY = 3;
export const REFERENCE_RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REFERENCE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type ReferenceResendRow = {
  carer_id: string;
  status: string;
  resend_count: number;
  last_resend_at: string | null;
};

export type ReferenceResendDecision =
  | { ok: true; nextResendCount: number }
  | { ok: false; status: 403 | 400 | 429; error: string };

/**
 * Enforces ownership, eligible status, and the per-reference rolling resend
 * window. Keeping this policy pure gives the API routes a narrow, testable
 * decision point before they create a replacement token.
 */
export function decideReferenceResend(args: {
  reference: ReferenceResendRow;
  requesterCarerId?: string;
  now: Date;
}): ReferenceResendDecision {
  const { reference, requesterCarerId, now } = args;
  if (requesterCarerId && reference.carer_id !== requesterCarerId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (reference.status !== "invited" && reference.status !== "expired") {
    return {
      ok: false,
      status: 400,
      error: "Only invited or expired references can be resent",
    };
  }

  const lastResendMs = reference.last_resend_at
    ? Date.parse(reference.last_resend_at)
    : Number.NaN;
  const inCurrentWindow =
    Number.isFinite(lastResendMs) &&
    now.getTime() - lastResendMs < REFERENCE_RESEND_WINDOW_MS;
  const resendCount = inCurrentWindow ? reference.resend_count : 0;

  if (resendCount >= MAX_REFERENCE_RESENDS_PER_DAY) {
    return {
      ok: false,
      status: 429,
      error: "You can resend this reference invitation up to 3 times in 24 hours",
    };
  }

  return { ok: true, nextResendCount: resendCount + 1 };
}

export function buildReferenceResendUpdate(args: {
  nextResendCount: number;
  token: string;
  now: Date;
}): {
  status: "invited";
  token: string;
  token_expires_at: string;
  resend_count: number;
  last_resend_at: string;
  reminder_stage: number;
} {
  return {
    status: "invited",
    token: args.token,
    token_expires_at: new Date(
      args.now.getTime() + REFERENCE_TOKEN_TTL_MS,
    ).toISOString(),
    resend_count: args.nextResendCount,
    last_resend_at: args.now.toISOString(),
    reminder_stage: 0,
  };
}
