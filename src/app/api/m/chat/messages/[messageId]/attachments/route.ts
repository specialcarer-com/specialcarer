import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isThreadParticipant } from "@/lib/chat/server";
import {
  handleList,
  type AttachmentRow,
  type ListClient,
} from "@/lib/chat/attachments-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/chat/messages/[messageId]/attachments
 *
 * Returns all attachments for the message plus 1-hour signed read URLs.
 * Caller must be a participant of the message's thread.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: messageRow, error: messageErr } = await admin
    .from("chat_messages")
    .select("id, thread_id")
    .eq("id", messageId)
    .maybeSingle();
  if (messageErr || !messageRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const threadId = (messageRow as { thread_id: string }).thread_id;

  const allowed = await isThreadParticipant(threadId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client: ListClient = {
    async listForMessage(id) {
      const { data, error } = await admin
        .from("chat_attachments")
        .select(
          "id, message_id, storage_path, mime_type, size_bytes, width, height, filename, created_at",
        )
        .eq("message_id", id)
        .order("created_at", { ascending: true });
      return {
        data: (data as AttachmentRow[] | null) ?? [],
        error: error ? { message: error.message } : null,
      };
    },
    async createSignedReadUrl(bucket, path, ttlSeconds) {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(path, ttlSeconds);
      return {
        data: data ? { signedUrl: data.signedUrl } : null,
        error: error ? { message: error.message } : null,
      };
    },
  };

  return handleList({ message_id: messageId, client });
}
