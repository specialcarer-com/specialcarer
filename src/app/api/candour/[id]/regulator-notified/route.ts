/**
 * POST /api/candour/[id]/regulator-notified — mark that the RM has
 * submitted the CQC notification for a case (Phase C — PR C3b).
 *
 * Admin-only. Calls `markRegulatorNotified` — moves the case into
 * `notified_regulator` and records the CQC reference number.
 *
 * Request body (JSON):
 *   { regulator_reference: string, notes?: string }
 *
 * Responses:
 *   200 { ok:true }                              — happy
 *   202 { ok:true, skippedReason }               — schema not applied
 *   400 { ok:false, error:'missing_reference' }  — empty reference
 *   400 { ok:false, error }                      — other validation
 *   401 { ok:false, error:'unauthenticated' }
 *   403 { ok:false, error:'forbidden' }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { markRegulatorNotified } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export const dynamic = "force-dynamic";

export type RegulatorNotifiedHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  caseDeps?: Partial<CaseDeps>;
};

type BodyShape = { regulator_reference?: unknown; notes?: unknown };

export async function handleRegulatorNotified(
  event_id: string,
  body: BodyShape,
  deps: RegulatorNotifiedHandlerDeps,
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
  const regulator_reference =
    typeof body.regulator_reference === "string"
      ? body.regulator_reference.trim()
      : "";
  if (!regulator_reference) {
    return NextResponse.json(
      { ok: false, error: "missing_reference" },
      { status: 400 },
    );
  }
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  const result = await markRegulatorNotified(
    event_id,
    actor.id,
    regulator_reference,
    notes,
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
  return handleRegulatorNotified(id, body, {
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
