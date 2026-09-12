/**
 * Tests for POST /api/candour/[id]/regulator-notified.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleRegulatorNotified } from "./route";
import { makeFakeCaseDb, seedEvent } from "../__helpers__/fake-case-db";

const EVENT_ID = "evt_1";

describe("POST /api/candour/[id]/regulator-notified — handleRegulatorNotified()", () => {
  it("returns 401 unauthenticated", async () => {
    const state = makeFakeCaseDb();
    const res = await handleRegulatorNotified(
      EVENT_ID,
      { regulator_reference: "CQC-123" },
      { getActor: async () => null, db: state.db },
    );
    assert.equal(res.status, 401);
  });

  it("returns 403 for non-admin", async () => {
    const state = makeFakeCaseDb();
    const res = await handleRegulatorNotified(
      EVENT_ID,
      { regulator_reference: "CQC-123" },
      {
        getActor: async () => ({ id: "u_1", role: "seeker" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 403);
  });

  it("returns 400 { error: 'missing_reference' } when reference blank", async () => {
    const state = makeFakeCaseDb();
    const res = await handleRegulatorNotified(
      EVENT_ID,
      { regulator_reference: "   " },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    const j = (await res.json()) as { ok: boolean; error: string };
    assert.equal(j.ok, false);
    assert.equal(j.error, "missing_reference");
  });

  it("happy path: sets state=notified_regulator, records reference, writes audit row", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "disclosure_complete" });
    const res = await handleRegulatorNotified(
      EVENT_ID,
      { regulator_reference: "CQC-XYZ-2026-042", notes: "submitted via portal" },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 200);
    assert.equal(state.events[0].state, "notified_regulator");
    assert.equal(state.events[0].regulator_reference, "CQC-XYZ-2026-042");
    const act = state.actions.find((a) => a.action === "regulator_notified");
    assert.ok(act);
    assert.equal(act?.new_state, "notified_regulator");
    assert.equal(act?.notes, "submitted via portal");
  });

  it("returns 202 on schema-not-ready", async () => {
    const state = makeFakeCaseDb({ eventsMissing: true });
    const res = await handleRegulatorNotified(
      EVENT_ID,
      { regulator_reference: "CQC-1" },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 202);
  });
});
