/**
 * PUT/POST /api/m/me/chat-translate-pref
 *
 * Set the caller's in-chat translation preference (profiles.chat_translate_to).
 * Body: { lang: string | null } — a supported language code, or null to
 * turn translation off. Writes through the user-scoped client so the
 * "users update own profile" RLS policy guards the row.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupportedLanguage } from "@/lib/chat/languages";

export const dynamic = "force-dynamic";

async function setPref(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { lang?: unknown };
  try {
    body = (await req.json()) as { lang?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lang = body.lang;
  if (lang !== null && (typeof lang !== "string" || !isSupportedLanguage(lang))) {
    return NextResponse.json({ error: "invalid_lang" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ chat_translate_to: lang })
    .eq("id", user.id);
  if (error) {
    console.error("[me.chat-translate-pref] update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ chat_translate_to: lang });
}

export const PUT = setPref;
export const POST = setPref;
