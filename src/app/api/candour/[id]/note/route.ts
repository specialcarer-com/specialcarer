/**
 * POST /api/candour/[id]/note — append a note action to the audit trail
 * without changing state (Phase C — PR C3b).
 *
 * Admin-only. Calls `addNote` from `@/lib/candour/case`.
 *
 * Request body (JSON):
 *   { notes: string }   // required, min 5 chars
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addNote } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

export type NoteHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  caseDeps?: Partial<CaseDeps>;
};

type BodyShape = { notes?: unknown };

export async function handleAddNote(
  event_id: string,
  body: BodyShape,
  deps: NoteHandlerDeps,
): Promise<NextResponse> {
  const actor = await deps.getActor();
  if (!actor) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }
  // TODO(rm-ni-split): allow role='rm' once introduced.
  if (actor.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length < 5) {
    return NextResponse.json(
      { ok: false, error: "notes_too_short" },
      { status: 400 },
    );
  }
  const result = await addNote(event_id, actor.id, notes, {
    db: deps.db,
    ...(deps.caseDeps ?? {}),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }
  if ("skippedReason" in result) {
    return NextResponse.json(
      { ok: true, skippedReason: result.skippedReason },
      { status: 202 },
    );
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: BodyShape = {};
  try {
    body = (await req.json()) as BodyShape;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  return handleAddNote(id, body, {
    getActor: async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return { id: user.id, role: (profile?.role as string | null) ?? null };
    },
    db: createAdminClient() as unknown as CaseAdminClient,
  });
}
