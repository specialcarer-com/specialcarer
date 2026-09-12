/**
 * Tests for POST /api/candour/[id]/disclosure.
 *
 * Exercises the handleDisclosure() function directly with fully
 * stubbed getActor + db deps — no next/navigation, no Supabase.
 * Mirrors the deps-injection pattern from
 * src/app/api/admin/training/courses/route.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleDisclosure } from "./route";
import { makeFakeCaseDb, seedEvent } from "../__helpers__/fake-case-db";

const EVENT_ID = "evt_1";

describe("POST /api/candour/[id]/disclosure — handleDisclosure()", () => {
  it("returns 401 when unauthenticated", async () => {
    const state = makeFakeCaseDb();
    const res = await handleDisclosure(
      EVENT_ID,
      { notes: "x".repeat(30) },
      { getActor: async () => null, db: state.db },
    );
    assert.equal(res.status, 401);
    const j = (await res.json()) as { ok: boolean; error: string };
    assert.equal(j.ok, false);
    assert.equal(j.error, "unauthenticated");
  });

  it("returns 403 when actor is not admin", async () => {
    const state = makeFakeCaseDb();
    const res = await handleDisclosure(
      EVENT_ID,
      { notes: "x".repeat(30) },
      {
        getActor: async () => ({ id: "u_1", role: "caregiver" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 403);
  });

  it("returns 400 when notes shorter than 20 chars", async () => {
    const state = makeFakeCaseDb();
    const res = await handleDisclosure(
      EVENT_ID,
      { notes: "too short" },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    const j = (await res.json()) as { error: string };
    assert.equal(j.error, "notes_too_short");
  });

  it("happy path: open → disclosure_in_progress, writes an action row", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "open" });
    const res = await handleDisclosure(
      EVENT_ID,
      { notes: "Family disclosure meeting scheduled for 14:00 tomorrow." },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 200);
    const j = (await res.json()) as { ok: boolean; new_state: string };
    assert.equal(j.ok, true);
    assert.equal(j.new_state, "disclosure_in_progress");
    assert.equal(state.events[0].state, "disclosure_in_progress");
    const action = state.actions.find((a) => a.action === "disclosure_recorded");
    assert.ok(action, "expected disclosure_recorded action row");
    assert.equal(action?.acted_by, "u_admin");
    assert.equal(action?.previous_state, "open");
    assert.equal(action?.new_state, "disclosure_in_progress");
  });

  it("returns 400 on invalid state transition (from disclosure_complete)", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "disclosure_complete" });
    const res = await handleDisclosure(
      EVENT_ID,
      { notes: "trying to advance past complete step" },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    const j = (await res.json()) as { error: string };
    assert.equal(j.error, "invalid_state_transition");
  });

  it("returns 202 on schema-not-ready (PG 42P01)", async () => {
    const state = makeFakeCaseDb({ eventsMissing: true });
    const res = await handleDisclosure(
      EVENT_ID,
      { notes: "x".repeat(30) },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 202);
    const j = (await res.json()) as { skippedReason: string };
    assert.equal(j.skippedReason, "schema_not_ready");
  });
});
