import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationInsert = {
  user_id: string;
  type: string;
  title: string;
  body: string;
  deeplink?: string;
  payload?: Record<string, unknown>;
};

export type CreatedNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/**
 * Insert a notification row using the service-role client.
 *
 * RLS denies anon/auth inserts on `notifications`, so this helper is
 * the only sanctioned way to add rows. Called by PR-A2's dispatcher
 * for every event that should surface in the inbox.
 */
export async function createNotification(
  input: NotificationInsert,
): Promise<CreatedNotification> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      body: input.body,
      deeplink: input.deeplink ?? null,
      payload: input.payload ?? {},
    })
    .select(
      "id, user_id, type, title, body, deeplink, payload, read_at, created_at",
    )
    .single();
  if (error || !data) {
    throw new Error(
      `createNotification failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data as CreatedNotification;
}
