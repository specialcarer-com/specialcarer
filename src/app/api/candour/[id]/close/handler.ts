// Testable implementation; keep non-route exports out of Next route.ts.
import { NextResponse } from "next/server";
import { closeCase } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export type CloseHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  caseDeps?: Partial<CaseDeps>;
};

export type BodyShape = { closure_reason?: unknown; ni_signoff_by?: unknown };

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
