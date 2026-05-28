/**
 * P1-B10: side-effect wiring for moderation hooks called from the
 * send-message route.
 *
 * Two operations, both pure-ish (DB I/O isolated behind injectable
 * client shapes for unit testing):
 *
 *   1. {@link checkBanned} — before a send, look up the caller's
 *      chat_participants row for this thread and return whether they
 *      are banned. Service-role lookup (RLS only exposes own row but
 *      this is defence-in-depth on a route the user already authed
 *      for).
 *
 *   2. {@link recordAutoFlags} — after a successful send, run the
 *      regex detector over the body and write one flag row per match
 *      (idempotent enough: the same message will only ever be
 *      detected once because it's only sent once). Stamps
 *      chat_messages.flagged_at on first match so the admin queue and
 *      future UI can show "under review" without a join.
 */
import type { ModerationMatch } from "./moderation";
import { detectOffPlatform } from "./moderation";

export type ModerationAdminLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: unknown;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert: (payload: unknown) => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>;
    update: (payload: unknown) => {
      eq: (col: string, val: string) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * True iff the caller has `banned_at` set on their chat_participants
 * row for this thread. NULL → not banned. Errors collapse to "not
 * banned" — moderation enforcement is best-effort at the send path
 * (admins can hard-delete the participant if needed); we never block
 * a legit user because the lookup glitched.
 */
export async function checkBanned(
  admin: ModerationAdminLike,
  threadId: string,
  userId: string,
): Promise<boolean> {
  try {
    const res = await admin
      .from("chat_participants")
      .select("banned_at")
      .eq("thread_id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (res.error || !res.data) return false;
    const row = res.data as { banned_at: string | null };
    return row.banned_at !== null;
  } catch {
    return false;
  }
}

/**
 * Write one flag row per detected pattern + stamp flagged_at on the
 * source message. Returns the number of flags written (0 if the body
 * has no matches, or any error path).
 *
 * Errors here never throw — moderation is a downstream signal, and
 * the caller's user-visible send already succeeded by the time this
 * runs. We log but do not bubble.
 */
export async function recordAutoFlags(
  admin: ModerationAdminLike,
  input: {
    message_id: string;
    thread_id: string;
    body: string;
  },
): Promise<number> {
  const { matches } = detectOffPlatform(input.body);
  if (matches.length === 0) return 0;
  try {
    const rows = matches.map((m: ModerationMatch) => ({
      message_id: input.message_id,
      thread_id: input.thread_id,
      flagged_by: null,
      reason: m.reason,
      auto_detected: true,
      detected_pattern: m.pattern,
      // status, created_at default in DB
    }));
    const ins = await admin.from("chat_message_flags").insert(rows);
    if (ins.error) {
      console.error("[chat.moderation] flag insert failed", ins.error);
      return 0;
    }
    const stamp = await admin
      .from("chat_messages")
      .update({ flagged_at: new Date().toISOString() })
      .eq("id", input.message_id);
    if (stamp.error) {
      // Non-fatal: the flag row is the source of truth.
      console.error(
        "[chat.moderation] flagged_at stamp failed",
        stamp.error,
      );
    }
    return rows.length;
  } catch (e) {
    console.error("[chat.moderation] recordAutoFlags threw", e);
    return 0;
  }
}
