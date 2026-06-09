/**
 * POST /api/m/chat/messages/[messageId]/translate
 *
 * Translate one chat message into the caller's chosen language, with a
 * read-through cache (chat_message_translations). Auth + participation
 * are enforced here; the cache/provider logic lives in the pure
 * handleTranslate handler.
 *
 * Cache reads use the user-scoped client (RLS lets participants read
 * their threads' translations). The message-body fetch and cache insert
 * use the admin client — the message-body read needs to resolve the
 * thread regardless of RLS shape, and inserts are service-role only.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isThreadParticipant } from "@/lib/chat/server";
import { rateLimit } from "@/lib/rate-limit";
import {
  handleTranslate,
  type TranslateClient,
  type CachedTranslation,
} from "@/lib/chat/translate-handler";
import { translateText } from "@/lib/chat/translate";

export const dynamic = "force-dynamic";

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

  // Resolve the message's thread, then assert the caller participates.
  const admin = createAdminClient();
  const { data: msgRow, error: msgErr } = await admin
    .from("chat_messages")
    .select("id, thread_id, body")
    .eq("id", messageId)
    .maybeSingle<{ id: string; thread_id: string; body: string }>();
  if (msgErr || !msgRow) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }
  const allowed = await isThreadParticipant(msgRow.thread_id, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cap to ~30 translations/minute/user to bound LLM spend on a hot thread.
  if (!rateLimit(`chat-translate:${user.id}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const client: TranslateClient = {
    async getCached(id, targetLang) {
      const { data } = await supabase
        .from("chat_message_translations")
        .select("translated_body, detected_source_lang, provider")
        .eq("message_id", id)
        .eq("target_lang", targetLang)
        .maybeSingle<CachedTranslation>();
      return data ?? null;
    },
    async getMessageBody(id) {
      // Already loaded above for the participation check.
      return id === msgRow.id ? msgRow.body : null;
    },
    async insertCached(row) {
      const { error } = await admin.from("chat_message_translations").insert({
        message_id: row.messageId,
        target_lang: row.targetLang,
        translated_body: row.translatedBody,
        detected_source_lang: row.detectedSourceLang,
        provider: row.provider,
      });
      // Ignore unique-violation races: a concurrent request may have
      // inserted the same (message, lang) pair; the row is identical.
      if (error && !error.message.includes("duplicate")) {
        console.error("[chat.translate] cache insert failed", error);
      }
    },
  };

  return handleTranslate({
    message_id: messageId,
    body,
    client,
    translate: (o) => translateText({ text: o.text, targetLang: o.targetLang }),
  });
}
