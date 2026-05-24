/**
 * Notifications inbox writer — thin placeholder shipped alongside PR-A2.
 *
 * The real implementation lands in PR-A3 (#19, bot/p0-a3-notifications-inbox),
 * which adds the `notifications` table + list/mark-read API routes. When A3
 * merges before A2, this file is overwritten by the A3 version.
 *
 * The stub writes via the service-role client into the `notifications` table
 * that A3 creates. If A2 reaches prod before A3, the insert silently fails
 * (table doesn't exist yet) — caught and logged, doesn't break dispatch().
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type CreateNotificationInput = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  deeplink?: string;
  payload?: Record<string, unknown>;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body,
    deeplink: input.deeplink ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    console.warn(
      JSON.stringify({
        at: "notifications.createNotification",
        level: "warn",
        msg: "insert failed",
        user_id: input.user_id,
        type: input.type,
        error: error.message,
      }),
    );
  }
}

/**
 * Returns true if a notification of the given type already exists for this
 * user + thread_id since midnight UTC today. Used by the message.received
 * dispatcher to avoid spamming the inbox — the bell badge already updates
 * via realtime, so a single grouped row per thread per day is plenty.
 */
export async function hasSameDayThreadNotification(args: {
  user_id: string;
  type: string;
  thread_id: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", args.user_id)
    .eq("type", args.type)
    .gte("created_at", startOfDay.toISOString())
    .contains("payload", { thread_id: args.thread_id })
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
