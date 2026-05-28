import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isThreadParticipant } from "@/lib/chat/server";
import {
  handleReportMessage,
  type ReportClient,
} from "@/lib/chat/report-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/messages/[messageId]/report
 *
 * Body: { reason: 'harassment'|'spam'|'safeguarding'|'other', notes?: string }
 *
 * The caller must be authenticated and a participant of the thread
 * the message belongs to. Inserts a row into chat_message_flags with
 * flagged_by=auth.uid() and auto_detected=false. The admin queue
 * (GET /api/admin/chat/flags) picks it up from there.
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

  // Resolve thread_id from the message id (denormalised onto the
  // flag row anyway, so we capture it here once). Using the admin
  // client because chat_messages RLS would force a participation
  // check we still need to run explicitly below.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const client: ReportClient = {
    async insertFlag(input) {
      const { data, error } = await admin
        .from("chat_message_flags")
        .insert({
          message_id: input.message_id,
          thread_id: input.thread_id,
          flagged_by: input.flagged_by,
          reason: input.reason,
          auto_detected: false,
          admin_notes: input.admin_notes,
        })
        .select("id")
        .single();
      return {
        data: (data as { id: string } | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    },
    async stampFlaggedAt(id) {
      try {
        await admin
          .from("chat_messages")
          .update({ flagged_at: new Date().toISOString() })
          .eq("id", id);
      } catch (e) {
        console.error("[chat.report] flagged_at stamp failed", e);
      }
    },
  };

  return handleReportMessage({
    message_id: messageId,
    thread_id: threadId,
    user_id: user.id,
    body,
    client,
  });
}
