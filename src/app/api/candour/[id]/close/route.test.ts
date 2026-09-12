/**
 * Tests for POST /api/candour/[id]/close.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleClose } from "./route";
import {
  makeFakeCaseDb,
  seedEvent,
  seedProfile,
} from "../__helpers__/fake-case-db";

const EVENT_ID = "evt_1";

const validClosure =
  "Case reviewed and closed after CQC acknowledgement received on 2026-09-14.";

describe("POST /api/candour/[id]/close — handleClose()", () => {
  it("401 unauthenticated", async () => {
    const state = makeFakeCaseDb();
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: validClosure, ni_signoff_by: "u_ni" },
      { getActor: async () => null, db: state.db },
    );
    assert.equal(res.status, 401);
  });

  it("403 non-admin", async () => {
    const state = makeFakeCaseDb();
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: validClosure, ni_signoff_by: "u_ni" },
      {
        getActor: async () => ({ id: "u_1", role: "caregiver" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 403);
  });

  it("400 closure_reason too short", async () => {
    const state = makeFakeCaseDb();
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: "short", ni_signoff_by: "u_ni" },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    const j = (await res.json()) as { error: string };
    assert.equal(j.error, "closure_reason_too_short");
  });

  it("400 missing ni_signoff_by", async () => {
    const state = makeFakeCaseDb();
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: validClosure, ni_signoff_by: "" },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "missing_ni_signoff",
    );
  });

  it("400 invalid_state (case not yet notified_regulator)", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "disclosure_complete" });
    seedProfile(state, { id: "u_ni", role: "admin" });
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: validClosure, ni_signoff_by: "u_ni" },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "invalid_state",
    );
  });

  it("400 ni_role_required when signoff user lacks admin role", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "notified_regulator" });
    seedProfile(state, { id: "u_ni", role: "caregiver" });
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: validClosure, ni_signoff_by: "u_ni" },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "ni_role_required",
    );
  });

  it("happy path: state=closed, writes ni_signoff_by + closure_reason + audit row", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "notified_regulator" });
    seedProfile(state, { id: "u_ni", role: "admin" });
    const res = await handleClose(
      EVENT_ID,
      { closure_reason: validClosure, ni_signoff_by: "u_ni" },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
      },
    );
    assert.equal(res.status, 200);
    assert.equal(state.events[0].state, "closed");
    assert.equal(state.events[0].ni_signoff_by, "u_ni");
    assert.equal(state.events[0].closure_reason, validClosure);
    const act = state.actions.find((a) => a.action === "closed");
    assert.ok(act);
    assert.equal(act?.new_state, "closed");
  });
});
