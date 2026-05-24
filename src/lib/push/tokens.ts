/**
 * Push-token store helpers.
 *
 * Reads/writes use the admin (service-role) client because the dispatcher
 * fans events out across users — RLS would otherwise hide other users'
 * tokens from the running request. Per-user endpoints under `/api/m/push/*`
 * still authenticate the caller and only mutate their own rows.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type PushPlatform = "ios" | "android" | "web";

export type PushToken = {
  id: string;
  user_id: string;
  platform: PushPlatform;
  token: string;
  device_id: string | null;
  app_version: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
};

/** Return all active (non-revoked) push tokens for a given user. */
export async function getActiveTokensForUser(
  user_id: string,
): Promise<PushToken[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_tokens")
    .select(
      "id, user_id, platform, token, device_id, app_version, last_seen_at, revoked_at, created_at",
    )
    .eq("user_id", user_id)
    .is("revoked_at", null);
  if (error) {
    throw new Error(`getActiveTokensForUser failed: ${error.message}`);
  }
  return (data ?? []) as PushToken[];
}

/**
 * Mark a token as revoked. Used by the dispatcher when APNs reports 410
 * Unregistered, and by the unregister endpoint.
 */
export async function revokeToken(token: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("push_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token)
    .is("revoked_at", null);
  if (error) {
    throw new Error(`revokeToken failed: ${error.message}`);
  }
}
