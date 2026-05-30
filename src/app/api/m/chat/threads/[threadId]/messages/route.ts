import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isThreadParticipant,
  listMessages,
  sendMessage,
} from "@/lib/chat/server";
import {
  checkBanned,
  recordAutoFlags,
  type ModerationAdminLike,
} from "@/lib/chat/moderation-wiring";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: string | null): number {
  if (raw == null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * GET /api/m/chat/threads/[threadId]/messages?limit=50&before=<iso>
 * Returns {messages: ChatMessage[]} newest-first. RLS gates results.
 * `before` pages backwards into history (cursor on created_at).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await isThreadParticipant(threadId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const before = url.searchParams.get("before") ?? undefined;
  try {
    const messages = await listMessages(threadId, limit, before);
    return NextResponse.json({ messages });
  } catch (e) {
    console.error("[chat.messages.GET] failed", e);
    return NextResponse.json({ error: "chat_list_failed" }, { status: 500 });
  }
}

/**
 * POST /api/m/chat/threads/[threadId]/messages   body: {body: string}
 *  - 400 chat_body_invalid for empty/too-long bodies
 *  - 403 if not a participant (also enforced by RLS on the insert)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await isThreadParticipant(threadId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // P1-B10: enforce a moderation ban *before* hitting validateBody +
  // the DB insert. checkBanned defaults to "not banned" on lookup
  // errors so a transient glitch never silences a legitimate user.
  const admin = createAdminClient() as unknown as ModerationAdminLike;
  const banned = await checkBanned(admin, threadId, user.id);
  if (banned) {
    return NextResponse.json({ error: "banned" }, { status: 403 });
  }

  let payload: { body?: unknown };
  try {
    payload = (await req.json()) as { body?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const message = await sendMessage(threadId, String(payload.body ?? ""));
    // P1-B10: auto-flag off-platform / off-channel content. Detection
    // is non-blocking — the message has already been delivered to the
    // recipient; the flag row drives the admin queue. Errors swallowed
    // inside recordAutoFlags.
    void recordAutoFlags(admin, {
      message_id: message.id,
      thread_id: threadId,
      body: message.body,
    });
    return NextResponse.json({ message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("chat_body_invalid")) {
      return NextResponse.json({ error: "chat_body_invalid" }, { status: 400 });
    }
    if (msg.includes("chat_unauthenticated")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // RLS rejection surfaces as a PostgREST error from the insert; map to 403.
    if (msg.includes("chat_send_failed")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[chat.messages.POST] failed", e);
    return NextResponse.json({ error: "chat_send_failed" }, { status: 500 });
  }
}
