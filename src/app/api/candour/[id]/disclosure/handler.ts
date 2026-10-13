// Testable implementation; keep non-route exports out of Next route.ts.
import { NextResponse } from "next/server";
import { recordDisclosure } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export type DisclosureHandlerDeps = {
  /** Auth callback — returns { user, role } or null if unauthenticated. */
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  /** Admin DB client (service-role) for the lib call. */
  db: CaseAdminClient;
  /** Extra deps forwarded into recordDisclosure — mostly for tests. */
  caseDeps?: Partial<CaseDeps>;
};

export type BodyShape = { notes?: unknown };

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
