import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleDelete,
  type DeleteClient,
} from "@/lib/chat/attachments-handler";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/m/chat/attachments/[attachmentId]
 *
 * Removes the storage object and the metadata row. Only the original
 * message sender or a platform admin may delete.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = (profile as { role?: string } | null)?.role === "admin";

  const admin = createAdminClient();
  const client: DeleteClient = {
    async getAttachment(id) {
      const { data, error } = await admin
        .from("chat_attachments")
        .select(
          "id, message_id, storage_path, chat_messages!inner(sender_id)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as {
        id: string;
        message_id: string;
        storage_path: string;
        chat_messages: { sender_id: string } | { sender_id: string }[];
      };
      const sender = Array.isArray(row.chat_messages)
        ? row.chat_messages[0]?.sender_id
        : row.chat_messages.sender_id;
      return {
        id: row.id,
        message_id: row.message_id,
        storage_path: row.storage_path,
        sender_id: sender,
      };
    },
    async removeStorage(bucket, path) {
      const { error } = await admin.storage.from(bucket).remove([path]);
      return { error: error ? { message: error.message } : null };
    },
    async deleteAttachment(id) {
      const { error } = await admin
        .from("chat_attachments")
        .delete()
        .eq("id", id);
      return { error: error ? { message: error.message } : null };
    },
  };

  return handleDelete({
    attachment_id: attachmentId,
    user_id: user.id,
    is_admin: isAdmin,
    client,
  });
}
