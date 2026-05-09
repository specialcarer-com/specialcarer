import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleIncomingMessage } from "@/lib/ai/chat";
import type { ChatSurface } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Session = {
  id: string;
  user_id: string | null;
  anon_session_id: string | null;
  surface: ChatSurface;
};

/**
 * POST /api/ai/chat/messages
 * Body: { session_id, body }
 *
 * The user message is recorded, classified, and a bot reply is
 * persisted. Returns { reply, intent, confidence, escalated, ticket_id }.
 *
 * Auth: a session may be anonymous, but if the session is bound to a
 * user_id, the caller must match.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const sessionId = typeof p.session_id === "string" ? p.session_id : "";
  const text = typeof p.body === "string" ? p.body.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }
  if (text.length < 1 || text.length > 4000) {
    return NextResponse.json({ error: "body_length" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("ai_chat_sessions")
    .select("id, user_id, anon_session_id, surface")
    .eq("id", sessionId)
    .maybeSingle<Session>();
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (session.user_id && session.user_id !== user?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await handleIncomingMessage({
    sessionId: session.id,
    userId: session.user_id,
    body: text,
    surface: session.surface,
  });
  return NextResponse.json(result);
}

/**
 * GET /api/ai/chat/messages?session_id=…
 * Returns messages oldest→newest.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id") ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("ai_chat_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; user_id: string | null }>();
  if (!session) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (session.user_id && session.user_id !== user?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { data, error } = await admin
    .from("ai_chat_messages")
    .select("id, session_id, role, body, meta, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}
