import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FORUM_SLOW_MODE_SECONDS } from "./types";

/**
 * Returns the timestamp of the most-recent thread or reply by this
 * user across both forum_threads and forum_posts, or null if they
 * have not posted before. Callers compare to the slow-mode window.
 */
export async function lastForumActivityAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<Date | null> {
  const [threadRes, postRes] = await Promise.all([
    supabase
      .from("forum_threads")
      .select("created_at")
      .eq("author_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    supabase
      .from("forum_posts")
      .select("created_at")
      .eq("author_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
  ]);

  const ts = [threadRes.data?.created_at, postRes.data?.created_at]
    .filter((t): t is string => typeof t === "string")
    .map((t) => new Date(t).getTime());
  if (ts.length === 0) return null;
  return new Date(Math.max(...ts));
}

/**
 * Returns null if the user is allowed to post now, otherwise the
 * number of seconds they must wait.
 */
export async function checkSlowMode(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const last = await lastForumActivityAt(supabase, userId);
  if (!last) return null;
  const elapsedSec = Math.floor((Date.now() - last.getTime()) / 1000);
  if (elapsedSec >= FORUM_SLOW_MODE_SECONDS) return null;
  return FORUM_SLOW_MODE_SECONDS - elapsedSec;
}
