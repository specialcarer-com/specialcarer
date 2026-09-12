/**
 * Tests for src/lib/candour/case.ts.
 *
 * Uses a fake Supabase-shaped admin client — no DB, no environment.
 * Covers the acceptance criteria from the task brief:
 *   - openCase happy path (event row + action row, computed SLA targets)
 *   - openCase schema-not-ready fallback (PG 42P01)
 *   - openCase rollback if the action insert fails (no event leak)
 *   - recordDisclosure state machine (open → in_progress → complete)
 *   - recordDisclosure rejects state jumps
 *   - markRegulatorNotified empty-reference rejection + happy path
 *   - closeCase requires state='notified_regulator'
 *   - closeCase requires NI role on the signoff profile
 *   - addNote does not change state
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  openCase,
  recordDisclosure,
  markRegulatorNotified,
  closeCase,
  addNote,
  type CaseAdminClient,
  type CaseDeps,
} from "./case";

// ─── Fake DB ────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  type: string;
  severity: string;
  reported_by: string;
  subject_person_id: string | null;
  subject_description: string | null;
  booking_id: string | null;
  carer_id: string | null;
  occurred_at: string | null;
  discovered_at: string;
  state: string;
  regulator_notify_target_at: string | null;
  candour_disclosure_target_at: string | null;
  regulator_notified_at: string | null;
  regulator_reference: string | null;
  disclosure_completed_at: string | null;
  closure_reason: string | null;
  ni_signoff_by: string | null;
  ni_signoff_at: string | null;
};

type ActionRow = {
  id: string;
  event_id: string;
  acted_by: string;
  action: string;
  previous_state: string | null;
  new_state: string | null;
  notes: string | null;
  attachment_path: string | null;
};

type ProfileRow = { id: string; role: string };

type FakeSim = {
  eventsMissing?: boolean;
  actionsMissing?: boolean;
  /** Force any action insert to fail with the given error (non-schema). */
  actionInsertError?: { code?: string; message: string } | null;
};

type FakeState = {
  events: EventRow[];
  actions: ActionRow[];
  profiles: ProfileRow[];
  sim: FakeSim;
  nextId: number;
};

function freshState(): FakeState {
  return { events: [], actions: [], profiles: [], sim: {}, nextId: 1 };
}

function nextId(state: FakeState, prefix: string): string {
  const n = state.nextId++;
  return `${prefix}_${n}`;
}

const PG_MISSING = (name: string) => ({
  code: "42P01",
  message: `relation "public.${name}" does not exist`,
});

function fakeDb(state: FakeState): CaseAdminClient {
  return {
    from(table: string) {
      const missing =
        (table === "notifiable_events" && state.sim.eventsMissing) ||
        (table === "notifiable_event_actions" && state.sim.actionsMissing);

      return {
        insert(row: Record<string, unknown>) {
          if (missing) {
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: PG_MISSING(table),
                }),
              }),
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: null, error: PG_MISSING(table) }),
            };
          }
          if (table === "notifiable_events") {
            const created: EventRow = {
              id: nextId(state, "evt"),
              type: String(row.type),
              severity: String(row.severity),
              reported_by: String(row.reported_by),
              subject_person_id: (row.subject_person_id as string | null) ?? null,
              subject_description: (row.subject_description as string | null) ?? null,
              booking_id: (row.booking_id as string | null) ?? null,
              carer_id: (row.carer_id as string | null) ?? null,
              occurred_at: (row.occurred_at as string | null) ?? null,
              discovered_at: String(row.discovered_at),
              state: String(row.state ?? "open"),
              regulator_notify_target_at:
                (row.regulator_notify_target_at as string | null) ?? null,
              candour_disclosure_target_at:
                (row.candour_disclosure_target_at as string | null) ?? null,
              regulator_notified_at: null,
              regulator_reference: null,
              disclosure_completed_at: null,
              closure_reason: null,
              ni_signoff_by: null,
              ni_signoff_at: null,
            };
            state.events.push(created);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: created.id },
                  error: null,
                }),
              }),
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: { id: created.id }, error: null }),
            };
          }
          if (table === "notifiable_event_actions") {
            if (state.sim.actionInsertError) {
              const err = state.sim.actionInsertError;
              return {
                then: (resolve: (v: unknown) => void) =>
                  resolve({ data: null, error: err }),
              };
            }
            const created: ActionRow = {
              id: nextId(state, "act"),
              event_id: String(row.event_id),
              acted_by: String(row.acted_by),
              action: String(row.action),
              previous_state: (row.previous_state as string | null) ?? null,
              new_state: (row.new_state as string | null) ?? null,
              notes: (row.notes as string | null) ?? null,
              attachment_path: (row.attachment_path as string | null) ?? null,
            };
            state.actions.push(created);
            return {
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: { id: created.id }, error: null }),
            };
          }
          return {
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: null, error: null }),
          };
        },

        select(_cols: string) {
          const filters: Array<{ col: string; val: unknown }> = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            async maybeSingle() {
              if (table === "notifiable_events") {
                if (missing) {
                  return { data: null, error: PG_MISSING(table) };
                }
                const found = state.events.find((r) =>
                  filters.every(
                    (f) => (r as Record<string, unknown>)[f.col] === f.val,
                  ),
                );
                return { data: found ?? null, error: null };
              }
              if (table === "profiles") {
                const found = state.profiles.find((r) =>
                  filters.every(
                    (f) => (r as Record<string, unknown>)[f.col] === f.val,
                  ),
                );
                return { data: found ?? null, error: null };
              }
              return { data: null, error: null };
            },
          };
          return chain;
        },

        update(patch: Record<string, unknown>) {
          const filters: Array<{ col: string; val: unknown }> = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              if (table === "notifiable_events") {
                if (missing) {
                  return resolve({ data: null, error: PG_MISSING(table) });
                }
                let updated = 0;
                for (const r of state.events) {
                  const matches = filters.every(
                    (f) => (r as Record<string, unknown>)[f.col] === f.val,
                  );
                  if (matches) {
                    Object.assign(r, patch);
                    updated++;
                  }
                }
                return resolve({ data: null, error: null, count: updated });
              }
              return resolve({ data: null, error: null });
            },
          };
          return chain;
        },

        delete() {
          const filters: Array<{ col: string; val: unknown }> = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              if (table === "notifiable_events") {
                state.events = state.events.filter(
                  (r) =>
                    !filters.every(
                      (f) => (r as Record<string, unknown>)[f.col] === f.val,
                    ),
                );
              }
              return resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
  };
}

// ─── Deps helpers ──────────────────────────────────────────────────────────

// Static SLA stubs so the case tests don't depend on the London/Intl
// calculation. Real SLA math is covered in sla.test.ts.
const STUB_SLA = {
  computeRegulatorTarget: (d: Date, t: string) =>
    t === "other" ? null : new Date(d.getTime() + 8 * 3600 * 1000),
  computeCandourTarget: (d: Date) =>
    new Date(d.getTime() + 10 * 24 * 3600 * 1000),
};

function baseDeps(state: FakeState, overrides: Partial<CaseDeps> = {}): CaseDeps {
  return {
    db: fakeDb(state),
    now: () => new Date("2026-11-16T10:00:00.000Z"),
    computeRegulatorTarget: STUB_SLA.computeRegulatorTarget,
    computeCandourTarget: STUB_SLA.computeCandourTarget,
    niRoleValues: ["admin"],
    ...overrides,
  };
}

// ─── openCase ──────────────────────────────────────────────────────────────

describe("openCase", () => {
  let state: FakeState;
  beforeEach(() => {
    state = freshState();
  });

  it("happy path — inserts event + 'opened' action, computes SLA targets", async () => {
    const result = await openCase(
      {
        type: "injury_serious",
        severity: "high",
        reported_by: "user_1",
        discovered_at: new Date("2026-11-16T09:00:00.000Z"),
        subject_description: "Service user fell during evening visit",
        notes: "Attended by ambulance",
      },
      baseDeps(state),
    );

    assert.equal(result.ok, true);
    assert.equal("event_id" in result, true);
    assert.equal(state.events.length, 1);
    assert.equal(state.actions.length, 1);
    const ev = state.events[0]!;
    assert.equal(ev.type, "injury_serious");
    assert.equal(ev.state, "open");
    assert.ok(ev.regulator_notify_target_at !== null);
    assert.ok(ev.candour_disclosure_target_at !== null);
    const act = state.actions[0]!;
    assert.equal(act.action, "opened");
    assert.equal(act.acted_by, "user_1");
    assert.equal(act.new_state, "open");
    assert.equal(act.notes, "Attended by ambulance");
  });

  it("type='other' → regulator target is null, candour target is set", async () => {
    const result = await openCase(
      {
        type: "other",
        severity: "low",
        reported_by: "user_1",
        subject_description: "Retrospective concern raised by family",
      },
      baseDeps(state),
    );
    assert.equal(result.ok, true);
    const ev = state.events[0]!;
    assert.equal(ev.regulator_notify_target_at, null);
    assert.ok(ev.candour_disclosure_target_at !== null);
  });

  it("rejects when neither subject_person_id nor subject_description is supplied", async () => {
    const result = await openCase(
      { type: "death", severity: "critical", reported_by: "u" },
      baseDeps(state),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "subject_required");
    }
    assert.equal(state.events.length, 0);
  });

  it("schema-not-ready — returns skippedReason, does not throw", async () => {
    state.sim.eventsMissing = true;
    const result = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "Anonymous report",
      },
      baseDeps(state),
    );
    assert.equal(result.ok, true);
    assert.equal("skippedReason" in result && result.skippedReason, "schema_not_ready");
    assert.equal(state.events.length, 0);
  });

  it("rollback — action insert failure removes the event row (no leak)", async () => {
    state.sim.actionInsertError = { message: "simulated action insert failure" };
    const result = await openCase(
      {
        type: "abuse_alleged",
        severity: "high",
        reported_by: "u",
        subject_description: "Suspected verbal abuse observed",
      },
      baseDeps(state),
    );
    assert.equal(result.ok, false);
    assert.equal(state.events.length, 0, "event row should have been rolled back");
    assert.equal(state.actions.length, 0);
  });

  it("rollback (schema race) — action table missing rolls back event and returns skip", async () => {
    state.sim.actionsMissing = true;
    const result = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "Test",
      },
      baseDeps(state),
    );
    assert.equal(result.ok, true);
    assert.equal("skippedReason" in result && result.skippedReason, "schema_not_ready");
    assert.equal(state.events.length, 0);
  });
});

// ─── recordDisclosure ──────────────────────────────────────────────────────

describe("recordDisclosure", () => {
  let state: FakeState;
  beforeEach(() => {
    state = freshState();
  });

  it("open → disclosure_in_progress on first call, → disclosure_complete on second", async () => {
    // Seed an open event.
    const opened = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "SU X",
      },
      baseDeps(state),
    );
    assert.equal(opened.ok, true);
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    const evtId = opened.event_id;

    const first = await recordDisclosure(evtId, "u", "spoke to next of kin", baseDeps(state));
    assert.equal(first.ok, true);
    assert.equal(state.events[0]!.state, "disclosure_in_progress");

    const second = await recordDisclosure(evtId, "u", "final disclosure meeting", baseDeps(state));
    assert.equal(second.ok, true);
    assert.equal(state.events[0]!.state, "disclosure_complete");
    assert.ok(state.events[0]!.disclosure_completed_at !== null);
  });

  it("rejects state jump — calling from 'disclosure_complete' fails", async () => {
    const opened = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "SU X",
      },
      baseDeps(state),
    );
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    const evtId = opened.event_id;
    await recordDisclosure(evtId, "u", null, baseDeps(state));
    await recordDisclosure(evtId, "u", null, baseDeps(state));
    const third = await recordDisclosure(evtId, "u", null, baseDeps(state));
    assert.equal(third.ok, false);
    if (!third.ok) {
      assert.equal(third.error, "invalid_state_transition");
    }
  });
});

// ─── markRegulatorNotified ─────────────────────────────────────────────────

describe("markRegulatorNotified", () => {
  let state: FakeState;
  beforeEach(() => {
    state = freshState();
  });

  it("rejects empty regulator_reference", async () => {
    const opened = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "SU",
      },
      baseDeps(state),
    );
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    const r = await markRegulatorNotified(
      opened.event_id,
      "u",
      "   ",
      null,
      baseDeps(state),
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "missing_reference");
  });

  it("accepts non-empty reference and stamps state + timestamp", async () => {
    const opened = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "SU",
      },
      baseDeps(state),
    );
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    const r = await markRegulatorNotified(
      opened.event_id,
      "u",
      "CQC-REF-12345",
      "notified via CQC portal",
      baseDeps(state),
    );
    assert.equal(r.ok, true);
    const ev = state.events[0]!;
    assert.equal(ev.state, "notified_regulator");
    assert.equal(ev.regulator_reference, "CQC-REF-12345");
    assert.ok(ev.regulator_notified_at !== null);
    // Two action rows: opened + regulator_notified.
    assert.equal(state.actions.length, 2);
    assert.equal(state.actions[1]!.action, "regulator_notified");
  });
});

// ─── closeCase ─────────────────────────────────────────────────────────────

describe("closeCase", () => {
  let state: FakeState;
  beforeEach(() => {
    state = freshState();
  });

  async function seedNotified(): Promise<string> {
    const opened = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "SU",
      },
      baseDeps(state),
    );
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    await markRegulatorNotified(
      opened.event_id,
      "u",
      "CQC-1",
      null,
      baseDeps(state),
    );
    return opened.event_id;
  }

  it("requires state='notified_regulator'", async () => {
    const opened = await openCase(
      {
        type: "death",
        severity: "critical",
        reported_by: "u",
        subject_description: "SU",
      },
      baseDeps(state),
    );
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    // profile with admin role so the role check doesn't confound the state check.
    state.profiles.push({ id: "ni_1", role: "admin" });
    const r = await closeCase(
      opened.event_id,
      "u",
      "resolved locally",
      "ni_1",
      baseDeps(state),
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "invalid_state");
  });

  it("requires NI-role signoff profile", async () => {
    const evtId = await seedNotified();
    state.profiles.push({ id: "not_ni", role: "caregiver" });
    const r = await closeCase(evtId, "u", "closed", "not_ni", baseDeps(state));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "ni_role_required");
  });

  it("happy path — sets state='closed', ni_signoff_by, closure_reason, timestamps", async () => {
    const evtId = await seedNotified();
    state.profiles.push({ id: "ni_1", role: "admin" });
    const r = await closeCase(evtId, "u", "concluded", "ni_1", baseDeps(state));
    assert.equal(r.ok, true);
    const ev = state.events[0]!;
    assert.equal(ev.state, "closed");
    assert.equal(ev.ni_signoff_by, "ni_1");
    assert.equal(ev.closure_reason, "concluded");
    assert.ok(ev.ni_signoff_at !== null);
  });
});

// ─── addNote ───────────────────────────────────────────────────────────────

describe("addNote", () => {
  it("does not change event state; writes a note_added action row", async () => {
    const state = freshState();
    const opened = await openCase(
      {
        type: "injury_serious",
        severity: "medium",
        reported_by: "u",
        subject_description: "SU",
      },
      baseDeps(state),
    );
    if (!opened.ok || !("event_id" in opened)) throw new Error("unreachable");
    const stateBefore = state.events[0]!.state;
    const r = await addNote(opened.event_id, "u", "additional context", baseDeps(state));
    assert.equal(r.ok, true);
    assert.equal(state.events[0]!.state, stateBefore);
    assert.equal(state.actions.length, 2);
    assert.equal(state.actions[1]!.action, "note_added");
    assert.equal(state.actions[1]!.previous_state, stateBefore);
    assert.equal(state.actions[1]!.new_state, stateBefore);
  });
});
