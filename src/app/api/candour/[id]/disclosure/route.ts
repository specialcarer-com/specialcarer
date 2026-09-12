/**
 * POST /api/candour/[id]/disclosure — advance the Reg 20 disclosure
 * clock (Phase C — PR C3b).
 *
 * Admin-only. Calls `recordDisclosure` from `@/lib/candour/case`, which
 * moves the case through open → disclosure_in_progress → disclosure_complete.
 *
 * Request body (JSON):
 *   { notes: string }   // required, min 20 chars
 *
 * Responses:
 *   200 { ok:true, new_state }              — happy
 *   202 { ok:true, skippedReason }          — schema not applied yet
 *   400 { ok:false, error }                 — validation / invalid transition
 *   401 { ok:false, error:'unauthenticated' }
 *   403 { ok:false, error:'forbidden' }
 *
 * Guarded on `role='admin'`. When the RM role lands (see PR #222 header
 * comment), extend the role list at the marked TODO below.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordDisclosure } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

export type DisclosureHandlerDeps = {
  /** Auth callback — returns { user, role } or null if unauthenticated. */
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  /** Admin DB client (service-role) for the lib call. */
  db: CaseAdminClient;
  /** Extra deps forwarded into recordDisclosure — mostly for tests. */
  caseDeps?: Partial<CaseDeps>;
};

type BodyShape = { notes?: unknown };

export async function handleDisclosure(
  event_id: string,
  body: BodyShape,
  deps: DisclosureHandlerDeps,
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
  if (notes.length < 20) {
    return NextResponse.json(
      { ok: false, error: "notes_too_short" },
      { status: 400 },
    );
  }
  const result = await recordDisclosure(event_id, actor.id, notes, {
    db: deps.db,
    ...(deps.caseDeps ?? {}),
  });
  if (!result.ok) {
    const status = result.error === "invalid_state_transition" ? 400 : 400;
    return NextResponse.json(
      { ok: false, error: result.error },
      { status },
    );
  }
  if ("skippedReason" in result) {
    return NextResponse.json(
      { ok: true, skippedReason: result.skippedReason },
      { status: 202 },
    );
  }
  return NextResponse.json(
    { ok: true, new_state: result.new_state },
    { status: 200 },
  );
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
  return handleDisclosure(id, body, {
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
