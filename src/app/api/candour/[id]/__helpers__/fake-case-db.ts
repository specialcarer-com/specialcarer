/**
 * Test-only fake Supabase-shaped admin client for the candour route
 * handler tests (Phase C — PR C3b).
 *
 * Mirrors the shape used by `src/lib/candour/case.test.ts` but exposes
 * a slightly richer surface (list, order, ilike-noops) suitable for
 * the queue + detail-page tests too. The fake is intentionally
 * partial — only the .from().insert/select/update/delete permutations
 * exercised by our tests are supported.
 */

import type { CaseAdminClient } from "@/lib/candour/case";

export type EventRow = {
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

export type ActionRow = {
  id: string;
  event_id: string;
  acted_by: string;
  action: string;
  previous_state: string | null;
  new_state: string | null;
  notes: string | null;
  attachment_path: string | null;
  created_at: string;
};

export type ProfileRow = { id: string; role: string; name?: string | null };

export type SimFlags = {
  eventsMissing?: boolean;
  actionsMissing?: boolean;
  actionInsertError?: { code?: string; message: string } | null;
};

export type FakeCaseState = {
  events: EventRow[];
  actions: ActionRow[];
  profiles: ProfileRow[];
  sim: SimFlags;
  nextId: number;
  db: CaseAdminClient;
};

const PG_MISSING = (name: string) => ({
  code: "42P01",
  message: `relation "public.${name}" does not exist`,
});

export function makeFakeCaseDb(sim: SimFlags = {}): FakeCaseState {
  const state: FakeCaseState = {
    events: [],
    actions: [],
    profiles: [],
    sim,
    nextId: 1,
    // filled below
    db: null as unknown as CaseAdminClient,
  };
  state.db = buildDb(state);
  return state;
}

function buildDb(state: FakeCaseState): CaseAdminClient {
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
            const id = `evt_${state.nextId++}`;
            const created: EventRow = {
              id,
              type: String(row.type),
              severity: String(row.severity),
              reported_by: String(row.reported_by),
              subject_person_id:
                (row.subject_person_id as string | null) ?? null,
              subject_description:
                (row.subject_description as string | null) ?? null,
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
            const id = `act_${state.nextId++}`;
            const created: ActionRow = {
              id,
              event_id: String(row.event_id),
              acted_by: String(row.acted_by),
              action: String(row.action),
              previous_state: (row.previous_state as string | null) ?? null,
              new_state: (row.new_state as string | null) ?? null,
              notes: (row.notes as string | null) ?? null,
              attachment_path: (row.attachment_path as string | null) ?? null,
              created_at: new Date().toISOString(),
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
          const chain: Record<string, unknown> = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            async maybeSingle() {
              if (table === "notifiable_events") {
                if (missing) return { data: null, error: PG_MISSING(table) };
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
                for (const r of state.events) {
                  const matches = filters.every(
                    (f) => (r as Record<string, unknown>)[f.col] === f.val,
                  );
                  if (matches) Object.assign(r, patch);
                }
                return resolve({ data: null, error: null });
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
  } as unknown as CaseAdminClient;
}

export function seedEvent(
  state: FakeCaseState,
  overrides: Partial<EventRow> & { id: string },
): EventRow {
  const now = new Date().toISOString();
  const row: EventRow = {
    id: overrides.id,
    type: overrides.type ?? "injury_serious",
    severity: overrides.severity ?? "medium",
    reported_by: overrides.reported_by ?? "u_reporter",
    subject_person_id: overrides.subject_person_id ?? null,
    subject_description: overrides.subject_description ?? "Test subject",
    booking_id: overrides.booking_id ?? null,
    carer_id: overrides.carer_id ?? null,
    occurred_at: overrides.occurred_at ?? null,
    discovered_at: overrides.discovered_at ?? now,
    state: overrides.state ?? "open",
    regulator_notify_target_at: overrides.regulator_notify_target_at ?? null,
    candour_disclosure_target_at:
      overrides.candour_disclosure_target_at ?? null,
    regulator_notified_at: overrides.regulator_notified_at ?? null,
    regulator_reference: overrides.regulator_reference ?? null,
    disclosure_completed_at: overrides.disclosure_completed_at ?? null,
    closure_reason: overrides.closure_reason ?? null,
    ni_signoff_by: overrides.ni_signoff_by ?? null,
    ni_signoff_at: overrides.ni_signoff_at ?? null,
  };
  state.events.push(row);
  return row;
}

export function seedProfile(
  state: FakeCaseState,
  row: ProfileRow,
): ProfileRow {
  state.profiles.push(row);
  return row;
}
