import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSession } from "@/lib/ai/chat";
import { CHAT_SURFACES, type ChatSurface } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ai/chat/sessions
 * Body: { surface?: 'web'|'mobile'|'help-center', anon_session_id?: string }
 *
 * If the caller is signed in, we reuse the most recent open session
 * for the same (user_id, surface). Otherwise we create a new
 * anonymous session (user_id remains null).
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

  const surface: ChatSurface =
    typeof p.surface === "string" &&
    (CHAT_SURFACES as readonly string[]).includes(p.surface)
      ? (p.surface as ChatSurface)
      : "web";
  const anonSessionId =
    typeof p.anon_session_id === "string" && p.anon_session_id
      ? p.anon_session_id
      : null;

  try {
    const session = await createSession({
      userId: user?.id ?? null,
      anonSessionId,
      surface,
    });
    return NextResponse.json({ session });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message ?? "create_failed" },
      { status: 500 },
    );
  }
}
