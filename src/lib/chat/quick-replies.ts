/**
 * Quick-reply chip config for the chat composer.
 *
 * Static v1 — role-specific arrays compiled into the client bundle. No
 * DB read, no admin UI. P1-B9.2 brief:
 *
 *   Carer:  "On my way", "Arrived", "Running late", "Task complete",
 *           "Heading home"
 *   Seeker: "Thanks", "On my way", "Please call me", "All good",
 *           "Need to reschedule"
 *
 * Phrasing is intentionally low-stakes — chips send instantly with no
 * confirmation, so they must read as polite, neutral, and verbatim
 * usable in any thread.
 *
 * v1.1 may move this to a `chat_quick_replies` table keyed by user_id
 * with the role-defaults as a seed. The exported function signature is
 * stable across that change.
 */

export type ChatRole = "seeker" | "carer" | "family";

export type QuickReply = {
  /** Stable id, used as React key. Lowercase snake_case. */
  id: string;
  /** Verbatim text inserted into the composer or sent immediately. */
  text: string;
};

const CARER_REPLIES: readonly QuickReply[] = [
  { id: "on_my_way", text: "On my way" },
  { id: "arrived", text: "Arrived" },
  { id: "running_late", text: "Running 5 min late" },
  { id: "task_complete", text: "Task complete" },
  { id: "heading_home", text: "Heading home" },
] as const;

const SEEKER_REPLIES: readonly QuickReply[] = [
  { id: "thanks", text: "Thanks" },
  { id: "on_my_way", text: "On my way" },
  { id: "please_call_me", text: "Please call me" },
  { id: "all_good", text: "All good" },
  { id: "need_to_reschedule", text: "Need to reschedule" },
] as const;

const FAMILY_REPLIES: readonly QuickReply[] = [
  { id: "thanks", text: "Thanks" },
  { id: "on_my_way", text: "On my way" },
  { id: "please_call_me", text: "Please call me" },
  { id: "got_it", text: "Got it" },
] as const;

/**
 * Returns the chip set for a role. Defensive: an unrecognised role
 * yields the seeker set (safer default than throwing in a UI hot path
 * — chips never block message send).
 */
export function getQuickReplies(role: ChatRole | string): readonly QuickReply[] {
  if (role === "carer") return CARER_REPLIES;
  if (role === "family") return FAMILY_REPLIES;
  return SEEKER_REPLIES;
}
