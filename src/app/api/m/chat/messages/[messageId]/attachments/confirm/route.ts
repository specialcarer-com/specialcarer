import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isThreadParticipant } from "@/lib/chat/server";
import {
  handleConfirm,
  type AttachmentRow,
  type ConfirmClient,
} from "@/lib/chat/attachments-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/messages/[messageId]/attachments/confirm
 *
 * After the client has uploaded to the signed URL, it calls this to
 * persist the metadata row. We verify the file actually exists in
 * storage before inserting.
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

  const client: ConfirmClient = {
    async getMessageMeta() {
      return { thread_id: meta.thread_id, sender_id: meta.sender_id };
    },
    async fileExists(bucket, path) {
      // List the parent directory and look for the leaf filename.
      const idx = path.lastIndexOf("/");
      const dir = idx >= 0 ? path.slice(0, idx) : "";
      const leaf = idx >= 0 ? path.slice(idx + 1) : path;
      const { data, error } = await admin.storage.from(bucket).list(dir, {
        limit: 1000,
        search: leaf,
      });
      if (error || !data) return false;
      return data.some((f) => f.name === leaf);
    },
    async insertAttachment(row) {
      const { data, error } = await admin
        .from("chat_attachments")
        .insert(row)
        .select(
          "id, message_id, storage_path, mime_type, size_bytes, width, height, filename, created_at",
        )
        .maybeSingle<AttachmentRow>();
      return {
        data,
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

  return handleConfirm({
    message_id: messageId,
    user_id: user.id,
    body,
    client,
  });
}
