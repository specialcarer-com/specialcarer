import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isThreadParticipant } from "@/lib/chat/server";
import {
  handleUploadUrl,
  type UploadUrlClient,
} from "@/lib/chat/attachments-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/messages/[messageId]/attachments/upload-url
 *
 * Body: { filename, mime_type, size_bytes }.
 * Caller must be the message sender and a participant of the thread.
 * Returns a 10-minute signed upload URL for `chat-attachments` bucket.
 */
export async function POST(
  req: Request,
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
    .select("id, thread_id, sender_id")
    .eq("id", messageId)
    .maybeSingle();
  if (messageErr || !messageRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const meta = messageRow as {
    id: string;
    thread_id: string;
    sender_id: string;
  };

  const allowed = await isThreadParticipant(meta.thread_id, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const client: UploadUrlClient = {
    async getMessageMeta() {
      return { thread_id: meta.thread_id, sender_id: meta.sender_id };
    },
    async countAttachments(id) {
      const { count, error } = await admin
        .from("chat_attachments")
        .select("id", { count: "exact", head: true })
        .eq("message_id", id);
      if (error) return 0;
      return count ?? 0;
    },
    async createSignedUploadUrl(bucket, path) {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUploadUrl(path);
      return {
        data: data
          ? { signedUrl: data.signedUrl, token: data.token }
          : null,
        error: error ? { message: error.message } : null,
      };
    },
    randomUUID() {
      return crypto.randomUUID();
    },
    now() {
      return new Date();
    },
  };

  return handleUploadUrl({
    message_id: messageId,
    user_id: user.id,
    body,
    client,
  });
}
