// Testable implementation; keep non-route exports out of Next route.ts.
import { NextResponse } from "next/server";
import { markRegulatorNotified } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export type RegulatorNotifiedHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  caseDeps?: Partial<CaseDeps>;
};

export type BodyShape = { regulator_reference?: unknown; notes?: unknown };

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
