// Testable implementation; keep non-route exports out of Next route.ts.
import { NextResponse } from "next/server";
import { addNote } from "@/lib/candour/case";
import type { CaseAdminClient, CaseDeps } from "@/lib/candour/case";

export type NoteHandlerDeps = {
  getActor: () => Promise<{ id: string; role: string | null } | null>;
  db: CaseAdminClient;
  caseDeps?: Partial<CaseDeps>;
};

export type BodyShape = { notes?: unknown };

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
