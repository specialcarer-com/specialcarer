import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/auth";
import {
  handleListFlags,
  type FlagStatus,
  type QueueClient,
  type QueueItem,
} from "@/lib/chat/admin-queue-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chat/flags?status=open&page=1&pageSize=20
 *
 * Admin-only paginated queue of chat moderation flags. Returns flags
 * joined to their source messages so the UI can render the offending
 * body inline without a second fetch.
 */
export async function GET(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const client: QueueClient = {
    async listFlags({ status, page, pageSize }) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = admin
        .from("chat_message_flags")
        .select(
          "id, message_id, thread_id, flagged_by, reason, auto_detected, detected_pattern, status, resolved_by, resolved_at, admin_notes, created_at",
        )
        .order("created_at", { ascending: false })
        .range(from, to);
      if (status !== "all") q = q.eq("status", status as FlagStatus);
      const { data: flags, error } = await q;
      if (error)
        return { data: [], error: { message: error.message } };

      // Resolve messages in one shot to avoid N+1 in the queue.
      const flagRows = (flags ?? []) as QueueItem[];
      const ids = Array.from(
        new Set(flagRows.map((f) => f.message_id).filter(Boolean)),
      );
      if (ids.length === 0) return { data: flagRows, error: null };
      const { data: msgs } = await admin
        .from("chat_messages")
        .select("id, body, sender_id, created_at")
        .in("id", ids);
      const byId = new Map(
        ((msgs ?? []) as Array<{
          id: string;
          body: string;
          sender_id: string;
          created_at: string;
        }>).map((m) => [m.id, m]),
      );
      const joined: QueueItem[] = flagRows.map((f) => ({
        ...f,
        message: byId.get(f.message_id) ?? null,
      }));
      return { data: joined, error: null };
    },
    // Unused on this route — present to satisfy the QueueClient shape.
    async getFlag() {
      return { data: null, error: null };
    },
    async applyAction() {
      return { error: null };
    },
    async updateFlag() {
      return { data: null, error: null };
    },
  };

  return handleListFlags({ url: new URL(req.url), client });
}
