export const REFERENCE_REMINDER_DAYS = {
  stage1: 3,
  stage2: 7,
  stage3: 12,
} as const;

export type ReferenceReminderRow = {
  created_at: string;
  token_expires_at: string;
  last_resend_at: string | null;
  reminder_stage: number;
};

export type ReferenceReminderCandidate = ReferenceReminderRow & {
  id: string;
  carer_id: string;
};

export type ReferenceReminderRunResult = {
  scanned: number;
  sent: number;
  errors: { reference_id: string; error: string }[];
};

/**
 * Return the next eligible reminder stage, if any. Token expiry is checked
 * here as well as in the query so an in-flight stale row cannot be emailed.
 */
export function nextReferenceReminderStage(
  reference: ReferenceReminderRow,
  now: Date,
): 1 | 2 | 3 | null {
  const tokenExpiresAt = Date.parse(reference.token_expires_at);
  if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= now.getTime()) {
    return null;
  }
  const createdAt = Date.parse(reference.created_at);
  if (!Number.isFinite(createdAt)) return null;
  const tokenIssuedAt = reference.last_resend_at
    ? Date.parse(reference.last_resend_at)
    : createdAt;
  if (!Number.isFinite(tokenIssuedAt)) return null;
  const ageMs = now.getTime() - Math.max(createdAt, tokenIssuedAt);
  const dayMs = 24 * 60 * 60 * 1000;

  if (
    reference.reminder_stage === 0 &&
    ageMs >= REFERENCE_REMINDER_DAYS.stage1 * dayMs
  ) {
    return 1;
  }
  if (
    reference.reminder_stage === 1 &&
    ageMs >= REFERENCE_REMINDER_DAYS.stage2 * dayMs
  ) {
    return 2;
  }
  if (
    reference.reminder_stage === 2 &&
    ageMs >= REFERENCE_REMINDER_DAYS.stage3 * dayMs
  ) {
    return 3;
  }
  return null;
}

export function firstName(name: string): string {
  const value = name.trim();
  return value.split(/\s+/)[0] || "the carer";
}

/**
 * Testable reminder orchestration. The route provides database and delivery
 * callbacks so a failed send is never marked as a completed reminder.
 */
export async function processReferenceReminders<T extends ReferenceReminderCandidate>(
  references: T[],
  now: Date,
  dependencies: {
    getCarerName: (carerId: string) => Promise<string | null>;
    dispatch: (args: {
      reference: T;
      stage: 1 | 2 | 3;
      carerName: string;
    }) => Promise<void>;
    markSent: (args: {
      reference: T;
      stage: 1 | 2 | 3;
      sentAt: string;
    }) => Promise<void>;
  },
): Promise<ReferenceReminderRunResult> {
  const carerNames = new Map<string, string>();
  const errors: ReferenceReminderRunResult["errors"] = [];
  let sent = 0;

  for (const reference of references) {
    const stage = nextReferenceReminderStage(reference, now);
    if (!stage) continue;

    try {
      let carerName = carerNames.get(reference.carer_id);
      if (!carerName) {
        carerName = firstName(
          (await dependencies.getCarerName(reference.carer_id)) ?? "the carer",
        );
        carerNames.set(reference.carer_id, carerName);
      }
      await dependencies.dispatch({ reference, stage, carerName });
      await dependencies.markSent({
        reference,
        stage,
        sentAt: now.toISOString(),
      });
      sent += 1;
    } catch (err) {
      errors.push({
        reference_id: reference.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scanned: references.length, sent, errors };
}
