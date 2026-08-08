export const REFERENCE_REMINDER_DAYS = {
  stage1: 3,
  stage2: 7,
  stage3: 12,
} as const;

export type ReferenceReminderRow = {
  created_at: string;
  token_expires_at: string;
  reminder_stage: number;
};

/**
 * Return the next eligible reminder stage, if any. Token expiry is checked
 * here as well as in the query so an in-flight stale row cannot be emailed.
 */
export function nextReferenceReminderStage(
  reference: ReferenceReminderRow,
  now: Date,
): 1 | 2 | 3 | null {
  if (Date.parse(reference.token_expires_at) <= now.getTime()) return null;
  const createdAt = Date.parse(reference.created_at);
  if (!Number.isFinite(createdAt)) return null;
  const ageMs = now.getTime() - createdAt;
  const hours = 60 * 60 * 1000;

  if (reference.reminder_stage === 0 && ageMs >= 72 * hours) return 1;
  if (reference.reminder_stage === 1 && ageMs >= 168 * hours) return 2;
  if (reference.reminder_stage === 2 && ageMs >= 288 * hours) return 3;
  return null;
}

export function firstName(name: string): string {
  const value = name.trim();
  return value.split(/\s+/)[0] || "the carer";
}
