import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isThreadParticipant } from "@/lib/chat/server";
import { chatRealtimeConfig } from "@/lib/chat/realtime";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/chat/threads/[threadId]/realtime
 *
 * Hands the browser the channel topic + filter + public Supabase
 * credentials needed to open a postgres_changes subscription. RLS
 * gates delivery; we still 403 non-participants here as defense-in-
 * depth so we don't even leak the topic shape.
 */
export async function GET(
  _req: Request,
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

  return NextResponse.json({
    config: chatRealtimeConfig(threadId),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  });
}
