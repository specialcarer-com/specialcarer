/**
 * Push token registry — thin placeholder shipped alongside PR-A2.
 *
 * The real implementation lands in PR-A1 (#18, bot/p0-a1-push-tokens),
 * which adds the `push_tokens` table + register/unregister endpoints.
 * When A1 merges before A2, this file is overwritten by the A1 version.
 *
 * The stub returns no active tokens so dispatch() degrades gracefully if
 * A2 ever ships before A1 (the notifications inbox row from A3 still
 * lands; the iOS push fan-out is a no-op until tokens exist).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type PushTokenPlatform = "ios" | "android" | "web";

export type PushToken = {
  id: string;
  user_id: string;
  platform: PushTokenPlatform;
  token: string;
  device_id: string | null;
  app_version: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
};

export async function getActiveTokensForUser(
  userId: string,
): Promise<PushToken[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_tokens")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) {
    console.warn(
      JSON.stringify({
        at: "push.tokens.getActiveTokensForUser",
        level: "warn",
        msg: "query failed",
        user_id: userId,
        error: error.message,
      }),
    );
    return [];
  }
  return (data ?? []) as PushToken[];
}

export async function revokeToken(token: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("push_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);
}
