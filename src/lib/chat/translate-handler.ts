/**
 * Pure handler for POST /api/m/chat/messages/[id]/translate.
 *
 * Auth & participation are guarded at the route boundary (matching the
 * pin-handler convention); this handler owns validation + the
 * read-through translation cache:
 *
 *   1. Look up (message_id, target_lang) in chat_message_translations.
 *      Hit → return it, cached: true.
 *   2. Miss → fetch the message body, call the LLM, insert the cache row,
 *      return it, cached: false.
 *
 * The DB client and the translate function are injected so the route
 * wires real Supabase + the OpenAI helper, while tests drive stubs.
 */
import { NextResponse } from "next/server";
import type { TranslateResult } from "./translate";

export const LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;

export type CachedTranslation = {
  translated_body: string;
  detected_source_lang: string | null;
  provider: string;
};

export type TranslateClient = {
  /** Cache lookup; null when no row exists for (messageId, targetLang). */
  getCached(
    messageId: string,
    targetLang: string,
  ): Promise<CachedTranslation | null>;
  /** The message's text body; null when the message does not exist. */
  getMessageBody(messageId: string): Promise<string | null>;
  /** Persist a freshly-computed translation (service role). */
  insertCached(row: {
    messageId: string;
    targetLang: string;
    translatedBody: string;
    detectedSourceLang: string | null;
    provider: string;
  }): Promise<void>;
};

export type TranslateFn = (opts: {
  text: string;
  targetLang: string;
}) => Promise<TranslateResult>;

export type TranslateHandlerInput = {
  message_id: string;
  body: unknown;
  client: TranslateClient;
  translate: TranslateFn;
};

type ResponseBody = {
  translated_body: string;
  detected_source_lang: string | null;
  target_lang: string;
  cached: boolean;
};

export async function handleTranslate(
  input: TranslateHandlerInput,
): Promise<NextResponse<ResponseBody | { error: string } | null>> {
  const { message_id, body, client, translate } = input;

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const targetLang = (body as { target_lang?: unknown }).target_lang;
  if (typeof targetLang !== "string" || !LANG_RE.test(targetLang)) {
    return NextResponse.json({ error: "invalid_target_lang" }, { status: 400 });
  }
  // cache_only: initial auto-load renders existing translations without
  // ever calling the provider — a miss returns 204 so the client keeps
  // showing the original until the user explicitly taps Translate.
  const cacheOnly = (body as { cache_only?: unknown }).cache_only === true;

  // 1. Read-through cache hit.
  const cached = await client.getCached(message_id, targetLang);
  if (cached) {
    return NextResponse.json({
      translated_body: cached.translated_body,
      detected_source_lang: cached.detected_source_lang,
      target_lang: targetLang,
      cached: true,
    });
  }
  if (cacheOnly) {
    return new NextResponse(null, { status: 204 });
  }

  // 2. Miss → fetch the source body.
  const sourceBody = await client.getMessageBody(message_id);
  if (sourceBody === null) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  // 3. Call the provider, then persist.
  let result: TranslateResult;
  try {
    result = await translate({ text: sourceBody, targetLang });
  } catch (e) {
    console.error("[chat.translate] provider failed", e);
    return NextResponse.json({ error: "translate_failed" }, { status: 502 });
  }

  await client.insertCached({
    messageId: message_id,
    targetLang,
    translatedBody: result.translated,
    detectedSourceLang: result.detectedSource,
    provider: result.provider,
  });

  return NextResponse.json({
    translated_body: result.translated,
    detected_source_lang: result.detectedSource,
    target_lang: targetLang,
    cached: false,
  });
}
