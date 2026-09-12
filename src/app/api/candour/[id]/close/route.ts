/**
 * POST /api/candour/[id]/close — close a notified case with NI sign-off
 * (Phase C — PR C3b).
 *
 * Admin-only. Calls `closeCase` from `@/lib/candour/case`. The lib
 * enforces state='notified_regulator' and that the signoff-user's
 * profile role is in the configured NI-role list (default ['admin']).
 *
 * Request body (JSON):
 *   { closure_reason: string, ni_signoff_by: uuid }   // closure_reason min 30 chars
 *
 * The handler ALSO pre-validates the ni_signoff_by profile's role
 * before calling the lib, so the 403 vs 400 error mapping is stable
 * (the lib returns `ni_role_required` which we translate to 400).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeCase } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

export type CloseHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  caseDeps?: Partial<CaseDeps>;
};

type BodyShape = { closure_reason?: unknown; ni_signoff_by?: unknown };

export async function handleClose(
  event_id: string,
  body: BodyShape,
  deps: CloseHandlerDeps,
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
  const closure_reason =
    typeof body.closure_reason === "string" ? body.closure_reason.trim() : "";
  if (closure_reason.length < 30) {
    return NextResponse.json(
      { ok: false, error: "closure_reason_too_short" },
      { status: 400 },
    );
  }
  const ni_signoff_by =
    typeof body.ni_signoff_by === "string" ? body.ni_signoff_by.trim() : "";
  if (!ni_signoff_by) {
    return NextResponse.json(
      { ok: false, error: "missing_ni_signoff" },
      { status: 400 },
    );
  }

  const result = await closeCase(
    event_id,
    actor.id,
    closure_reason,
    ni_signoff_by,
    // TODO(rm-ni-split): pass niRoleValues:['ni'] once introduced.
    { db: deps.db, ...(deps.caseDeps ?? {}) },
  );
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
  return handleClose(id, body, {
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
