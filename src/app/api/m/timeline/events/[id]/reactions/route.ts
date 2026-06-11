import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toggleReaction } from "@/lib/timeline/server";
import {
  TIMELINE_REACTION_KINDS,
  type TimelineReactionKind,
} from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/timeline/events/[id]/reactions  { kind }
 *
 * Toggle a reaction on/off for the current user. RLS allows any reader of the
 * event (seeker or active family member) to react; carers are read-only.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const p = (payload ?? {}) as Record<string, unknown>;
  const kind = typeof p.kind === "string" ? p.kind : "";
  if (!(TIMELINE_REACTION_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  const result = await toggleReaction(eventId, kind as TimelineReactionKind);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, active: result.active });
}
