import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import {
  handleUpdateFlag,
  type FlagAction,
  type FlagRow,
  type QueueClient,
} from "@/lib/chat/admin-queue-handler";

export const dynamic = "force-dynamic";

const MUTE_24H_MS = 24 * 60 * 60 * 1000;

/**
 * PATCH /api/admin/chat/flags/[flagId]
 *
 * Admin-only. Body: { status, admin_notes?, action? }
 *   - status: required, new flag status
 *   - admin_notes: optional notes to store on the flag row
 *   - action: optional enforcement action — applied to the message
 *     sender's chat_participants row before the flag is updated
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ flagId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const me = guard.admin;

  const { flagId } = await params;
  const admin = createAdminClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Surface as a 400 via the pure handler (non-object branch).
    body = null;
  }

  const client: QueueClient = {
    // unused on PATCH but the QueueClient type covers both endpoints
    async listFlags() {
      return { data: [], error: null };
    },
    async getFlag(id) {
      const { data, error } = await admin
        .from("chat_message_flags")
        .select(
          "id, message_id, thread_id, flagged_by, reason, auto_detected, detected_pattern, status, resolved_by, resolved_at, admin_notes, created_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error || !data)
        return {
          data: null,
          error: error ? { message: error.message } : null,
        };
      // Resolve sender_id via the source message.
      const { data: msg } = await admin
        .from("chat_messages")
        .select("sender_id")
        .eq("id", (data as { message_id: string }).message_id)
        .maybeSingle();
      const senderId = (msg as { sender_id: string } | null)?.sender_id ?? "";
      return {
        data: { ...(data as FlagRow), sender_id: senderId },
        error: null,
      };
    },
    async applyAction({ sender_id, thread_id, action }) {
      const patch = buildParticipantPatch(action);
      // mark_safeguarding has no participant-table side effect — only
      // the flag status changes — so the patch may be empty.
      if (patch !== null) {
        const { error } = await admin
          .from("chat_participants")
          .update(patch)
          .eq("thread_id", thread_id)
          .eq("user_id", sender_id);
        if (error) return { error: { message: error.message } };
      }
      return { error: null };
    },
    async updateFlag({ flag_id, status, admin_notes, admin_id }) {
      const { data, error } = await admin
        .from("chat_message_flags")
        .update({
          status,
          admin_notes,
          resolved_by: admin_id,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", flag_id)
        .select(
          "id, message_id, thread_id, flagged_by, reason, auto_detected, detected_pattern, status, resolved_by, resolved_at, admin_notes, created_at",
        )
        .maybeSingle<FlagRow>();
      return {
        data,
        error: error ? { message: error.message } : null,
      };
    },
  };

  const res = await handleUpdateFlag({
    flag_id: flagId,
    admin_id: me.id,
    body,
    client,
  });
  if (res.status === 200) {
    await logAdminAction({
      admin: me,
      action: "chat.flag.resolve",
      targetType: "chat_message_flag",
      targetId: flagId,
    });
  }
  return res;
}

/**
 * Map an enforcement action to the chat_participants column patch.
 * Returns null when the action has no participant-table effect (e.g.
 * mark_safeguarding only changes the flag's status).
 */
function buildParticipantPatch(
  action: FlagAction,
): Record<string, string | null> | null {
  const now = new Date();
  switch (action) {
    case "warn_sender":
      // No DB-side effect yet; warning is delivered via the
      // notification channel (out of scope for this PR). The flag
      // status carries the auditable record.
      return null;
    case "ban_sender":
      return { banned_at: now.toISOString() };
    case "mute_sender_24h":
      return { muted_until: new Date(now.getTime() + MUTE_24H_MS).toISOString() };
    case "mark_safeguarding":
      return null;
    default:
      return null;
  }
}
