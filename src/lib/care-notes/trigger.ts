/**
 * Fire-and-forget summarisation trigger for the journal save path (gap 29).
 *
 * When a carer saves a long note we kick off summarisation WITHOUT awaiting it,
 * so the save response is not blocked on the LLM round-trip. The family timeline
 * shows a "Summarising…" shimmer until the row lands, then renders "Key points".
 *
 * Errors are swallowed (logged only): a failed summary must never fail the save,
 * and the family can re-trigger on demand via POST /api/m/care-notes/[id]/summarise.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSummaryStore } from "./store";
import { summariseNote, MIN_SUMMARY_CHARS } from "./summarise";

/**
 * Enqueue summarisation for a freshly-saved note if it's long enough. Returns
 * immediately; the actual work runs detached. Safe to call unconditionally —
 * it no-ops for short notes.
 */
export function triggerNoteSummary(noteId: string, noteText: string): void {
  if ((noteText?.trim().length ?? 0) < MIN_SUMMARY_CHARS) return;

  // Detached: do not await. Use the admin client for both read and write so we
  // don't depend on a request-scoped session that may have ended.
  void (async () => {
    try {
      const admin = createAdminClient();
      const store = createSummaryStore(admin, admin);
      await summariseNote({ noteId, noteText, store });
    } catch (e) {
      console.error("[care-notes.trigger] summary failed", noteId, e);
    }
  })();
}
