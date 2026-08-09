export type ReferenceReminderCronAuthorisation =
  | { ok: true }
  | { ok: false; status: 401; error: string };

export function authoriseReferenceReminderCron(
  authorization: string | null,
  expectedSecret: string | undefined,
): ReferenceReminderCronAuthorisation {
  if (!expectedSecret) {
    return { ok: false, status: 401, error: "CRON_SECRET not configured" };
  }
  if (authorization !== `Bearer ${expectedSecret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
