/**
 * Tests for POST /api/candour/[id]/note.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleAddNote } from "./route";
import { makeFakeCaseDb, seedEvent } from "../__helpers__/fake-case-db";

const EVENT_ID = "evt_1";

describe("POST /api/candour/[id]/note — handleAddNote()", () => {
  it("401 unauthenticated", async () => {
    const state = makeFakeCaseDb();
    const res = await handleAddNote(
      EVENT_ID,
      { notes: "hello world" },
      { getActor: async () => null, db: state.db },
    );
    assert.equal(res.status, 401);
  });

  it("403 non-admin", async () => {
    const state = makeFakeCaseDb();
    const res = await handleAddNote(
      EVENT_ID,
      { notes: "hello world" },
      {
        getActor: async () => ({ id: "u_1", role: "caregiver" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 403);
  });

  it("400 notes too short", async () => {
    const state = makeFakeCaseDb();
    const res = await handleAddNote(
      EVENT_ID,
      { notes: "hi" },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    const j = (await res.json()) as { error: string };
    assert.equal(j.error, "notes_too_short");
  });

  it("happy path: writes a note_added action, does not change state", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "disclosure_in_progress" });
    const res = await handleAddNote(
      EVENT_ID,
      { notes: "Family declined phone contact — sending written letter." },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 200);
    assert.equal(state.events[0].state, "disclosure_in_progress");
    const act = state.actions.find((a) => a.action === "note_added");
    assert.ok(act);
    assert.equal(act?.previous_state, "disclosure_in_progress");
    assert.equal(act?.new_state, "disclosure_in_progress");
  });
});
