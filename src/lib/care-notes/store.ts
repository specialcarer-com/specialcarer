/**
 * Supabase-backed SummaryStore for care-note summaries (gap 29).
 *
 * Reads go through whatever client the caller passes (the user-scoped SSR
 * client when serving a request, so RLS applies; or the admin client). Writes
 * MUST use the admin client — care_note_summaries has no INSERT policy, so
 * inserts are service-role only.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CachedSummary, SummaryStore } from "./summarise";

/**
 * @param readClient client used for the cache read (user-scoped → RLS, or admin)
 * @param adminClient service-role client used for inserts (defaults to a fresh one)
 */
export function createSummaryStore(
  readClient: SupabaseClient,
  adminClient: SupabaseClient = createAdminClient(),
): SummaryStore {
  return {
    async getCached(noteId: string): Promise<CachedSummary | null> {
      const { data } = await readClient
        .from("care_note_summaries")
        .select("summary, model, prompt_version")
        .eq("note_id", noteId)
        .maybeSingle<CachedSummary>();
      return data ?? null;
    },
    async insert(row) {
      const { error } = await adminClient.from("care_note_summaries").insert({
        note_id: row.noteId,
        summary: row.summary,
        model: row.model,
        prompt_version: row.promptVersion,
      });
      // Ignore unique-violation races: a concurrent request (e.g. the
      // fire-and-forget save trigger and an on-demand POST) may have inserted
      // the same note's summary first. The row is equivalent.
      if (error && !error.message.includes("duplicate")) {
        throw error;
      }
    },
  };
}
