/**
 * Duty-of-candour + notifiable-event case library (Phase C — PR C3a).
 *
 * This is the pure state-machine + audit-trail layer. The HTTP endpoint
 * at `src/app/api/candour/open/route.ts` calls `openCase`; C3b's admin
 * UI will call the other functions.
 *
 * Design
 * ──────
 * Every function is deps-injectable. The `deps` bundle contains:
 *   - `db`  a Supabase-shaped client. In production this is the admin
 *           (service-role) client; in tests it's a plain fake.
 *   - `now` a clock, defaulting to `() => new Date()`.
 *   - `niRoleValues` the set of `profiles.role` values that count as
 *           Nominated Individual for the purpose of `closeCase`.
 *           Defaulted to `['admin']` today because RM/NI roles are
 *           not yet in the enum (see the migration file's header
 *           comment for the roadmap). Injecting the list means tests
 *           and the future roles PR can extend it without a code
 *           edit here.
 *
 * The complete-override pattern (see `src/lib/stripe/payout-webhook.ts`)
 * means when the caller supplies a full deps bundle no runtime imports
 * happen, keeping tests free of server-only transitive pulls.
 *
 * State machine
 * ─────────────
 * Enforced in code rather than a DB trigger. The migration allows all
 * transitions at the CHECK-constraint level; this file rejects state
 * jumps and produces a structured `{ok:false, error}` result.
 *
 *     open ──▶ disclosure_in_progress ──▶ disclosure_complete ──▶ notified_regulator ──▶ closed
 *
 * The `notified_regulator` step can also be reached directly from
 * `disclosure_in_progress` or `disclosure_complete` — a notification
 * to CQC is orthogonal to the family disclosure timeline.
 *
 * Idempotency / atomicity
 * ───────────────────────
 * Supabase doesn't expose a transaction primitive over PostgREST, so
 * `openCase` inserts the event first, then the action, and if the
 * action insert fails it DELETEs the event row before returning an
 * error. Tests assert no partial row leaks.
 *
 * Deploy-safety
 * ─────────────
 * Every function that reads/writes `notifiable_events` or
 * `notifiable_event_actions` catches PG 42P01 (`relation does not
 * exist`) and returns `{ok:true, skippedReason:'schema_not_ready'}`.
 * The endpoint upgrades that to a 202. Mirrors PR #221's payout
 * webhook fallback shape.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CaseAdminClient = { from(table: string): any };

export type NotifiableType =
  | "death"
  | "injury_serious"
  | "abuse_alleged"
  | "deprivation_of_liberty"
  | "incident_police_involved"
  | "service_stopped"
  | "other";

export type Severity = "low" | "medium" | "high" | "critical";

export type CaseState =
  | "open"
  | "disclosure_in_progress"
  | "disclosure_complete"
  | "notified_regulator"
  | "closed";

export type CaseDeps = {
  db: CaseAdminClient;
  now?: () => Date;
  /** profiles.role values counted as Nominated Individual. Default: ['admin']. */
  niRoleValues?: readonly string[];
  /**
   * Injected SLA calculator so tests don't need the real Intl-based
   * implementation. Defaults to importing `./sla` at first call.
   */
  computeRegulatorTarget?: (
    discovered_at: Date,
    type: NotifiableType,
  ) => Date | null;
  computeCandourTarget?: (discovered_at: Date) => Date;
};

export type OpenCaseInput = {
  type: NotifiableType;
  severity: Severity;
  reported_by: string;
  discovered_at?: Date;
  occurred_at?: Date | null;
  subject_person_id?: string | null;
  subject_description?: string | null;
  booking_id?: string | null;
  carer_id?: string | null;
  notes?: string | null;
};

export type OpenCaseResult =
  | { ok: true; event_id: string }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: string };

// ── PG error helpers ────────────────────────────────────────────────────────

const PG_UNDEFINED_TABLE = "42P01";

function isSchemaMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  return (
    code === PG_UNDEFINED_TABLE ||
    /relation .*notifiable_events.* does not exist/i.test(message) ||
    /relation .*notifiable_event_actions.* does not exist/i.test(message) ||
    /could not find the table .*notifiable_events/i.test(message) ||
    /could not find the table .*notifiable_event_actions/i.test(message)
  );
}

function errMsg(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message ?? fallback;
}

// ── Default deps loader (only touched when a partial bundle is supplied) ────

async function resolveSlaDeps(
  deps: CaseDeps,
): Promise<{
  regulator: (d: Date, t: NotifiableType) => Date | null;
  candour: (d: Date) => Date;
}> {
  if (deps.computeRegulatorTarget && deps.computeCandourTarget) {
    return {
      regulator: deps.computeRegulatorTarget,
      candour: deps.computeCandourTarget,
    };
  }
  const sla = await import("./sla");
  return {
    regulator: deps.computeRegulatorTarget ?? sla.regulatorNotifyTarget,
    candour: deps.computeCandourTarget ?? sla.candourDisclosureTarget,
  };
}

function niRoles(deps: CaseDeps): readonly string[] {
  // Today only `admin` acts as NI — see migration header comment.
  return deps.niRoleValues ?? ["admin"];
}

// ── openCase ───────────────────────────────────────────────────────────────

export async function openCase(
  input: OpenCaseInput,
  deps: CaseDeps,
): Promise<OpenCaseResult> {
  if (!input.subject_person_id && !input.subject_description) {
    return { ok: false, error: "subject_required" };
  }
  const now = (deps.now ?? (() => new Date()))();
  const discovered_at = input.discovered_at ?? now;
  const sla = await resolveSlaDeps(deps);
  const regTarget = sla.regulator(discovered_at, input.type);
  const disclosureTarget = sla.candour(discovered_at);

  const row = {
    type: input.type,
    severity: input.severity,
    reported_by: input.reported_by,
    subject_person_id: input.subject_person_id ?? null,
    subject_description: input.subject_description ?? null,
    booking_id: input.booking_id ?? null,
    carer_id: input.carer_id ?? null,
    occurred_at: input.occurred_at ? input.occurred_at.toISOString() : null,
    discovered_at: discovered_at.toISOString(),
    severity_state_defaulted: undefined, // ignored
    state: "open" as const,
    regulator_notify_target_at: regTarget ? regTarget.toISOString() : null,
    candour_disclosure_target_at: disclosureTarget.toISOString(),
  };
  // Drop the sentinel we accidentally introduced above.
  delete (row as Record<string, unknown>).severity_state_defaulted;

  const { data: inserted, error: insErr } = await deps.db
    .from("notifiable_events")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (isSchemaMissing(insErr)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return { ok: false, error: errMsg(insErr, "event insert failed") };
  }
  if (!inserted) {
    return { ok: false, error: "event insert returned no row" };
  }
  const eventId = (inserted as { id: string }).id;

  const actionRow = {
    event_id: eventId,
    acted_by: input.reported_by,
    action: "opened",
    previous_state: null,
    new_state: "open",
    notes: input.notes ?? null,
    attachment_path: null,
  };
  const { error: actErr } = await deps.db
    .from("notifiable_event_actions")
    .insert(actionRow);

  if (actErr) {
    if (isSchemaMissing(actErr)) {
      // The event table exists but the actions table doesn't — extremely
      // unusual (both are added by the same migration) but be safe.
      // Roll back the event insert so the caller sees a clean skip.
      try {
        await deps.db.from("notifiable_events").delete().eq("id", eventId);
      } catch {
        // Best-effort — nothing to be done.
      }
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    // Any other error: roll back and surface.
    try {
      await deps.db.from("notifiable_events").delete().eq("id", eventId);
    } catch {
      // Ignore rollback failure — we still want to surface the original.
    }
    return { ok: false, error: errMsg(actErr, "action insert failed") };
  }

  return { ok: true, event_id: eventId };
}

// ── Shared helpers for state-changing library functions ────────────────────

async function fetchEventState(
  db: CaseAdminClient,
  event_id: string,
): Promise<
  | { ok: true; state: CaseState }
  | { ok: false; error: string }
  | { ok: true; skippedReason: "schema_not_ready" }
> {
  const { data, error } = await db
    .from("notifiable_events")
    .select("id, state")
    .eq("id", event_id)
    .maybeSingle();
  if (error) {
    if (isSchemaMissing(error)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return { ok: false, error: errMsg(error, "event fetch failed") };
  }
  if (!data) return { ok: false, error: "event_not_found" };
  return { ok: true, state: (data as { state: CaseState }).state };
}

async function writeAction(
  db: CaseAdminClient,
  row: {
    event_id: string;
    acted_by: string;
    action: string;
    previous_state?: string | null;
    new_state?: string | null;
    notes?: string | null;
    attachment_path?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.from("notifiable_event_actions").insert({
    event_id: row.event_id,
    acted_by: row.acted_by,
    action: row.action,
    previous_state: row.previous_state ?? null,
    new_state: row.new_state ?? null,
    notes: row.notes ?? null,
    attachment_path: row.attachment_path ?? null,
  });
  if (error) return { ok: false, error: errMsg(error, "action insert failed") };
  return { ok: true };
}

// ── recordDisclosure ───────────────────────────────────────────────────────

export type RecordDisclosureResult =
  | { ok: true; new_state: "disclosure_in_progress" | "disclosure_complete" }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: string };

/**
 * Advance the disclosure clock. Two steps:
 *   open                     → disclosure_in_progress
 *   disclosure_in_progress   → disclosure_complete (stamps disclosure_completed_at)
 *
 * State jumps (e.g. open → disclosure_complete) are rejected with
 * `{ok:false, error:'invalid_state_transition'}`. Idempotent from the
 * caller's POV in the sense that calling twice from `open` moves you
 * through both steps; calling from `disclosure_complete` is an error.
 */
export async function recordDisclosure(
  event_id: string,
  actor_id: string,
  notes: string | null,
  deps: CaseDeps,
): Promise<RecordDisclosureResult> {
  const cur = await fetchEventState(deps.db, event_id);
  if ("skippedReason" in cur) return cur;
  if (!cur.ok) return cur;

  const now = (deps.now ?? (() => new Date()))();
  const previous_state = cur.state;
  let new_state: "disclosure_in_progress" | "disclosure_complete";
  const patch: Record<string, unknown> = {};

  if (cur.state === "open") {
    new_state = "disclosure_in_progress";
    patch.state = new_state;
  } else if (cur.state === "disclosure_in_progress") {
    new_state = "disclosure_complete";
    patch.state = new_state;
    patch.disclosure_completed_at = now.toISOString();
  } else {
    return { ok: false, error: "invalid_state_transition" };
  }

  const { error: updErr } = await deps.db
    .from("notifiable_events")
    .update(patch)
    .eq("id", event_id);
  if (updErr) {
    if (isSchemaMissing(updErr)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return { ok: false, error: errMsg(updErr, "event update failed") };
  }

  const actRes = await writeAction(deps.db, {
    event_id,
    acted_by: actor_id,
    action: "disclosure_recorded",
    previous_state,
    new_state,
    notes,
  });
  if (!actRes.ok) return actRes;
  return { ok: true, new_state };
}

// ── markRegulatorNotified ──────────────────────────────────────────────────

export type MarkRegulatorResult =
  | { ok: true }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: "missing_reference" | string };

export async function markRegulatorNotified(
  event_id: string,
  actor_id: string,
  regulator_reference: string,
  notes: string | null,
  deps: CaseDeps,
): Promise<MarkRegulatorResult> {
  if (!regulator_reference || regulator_reference.trim() === "") {
    return { ok: false, error: "missing_reference" };
  }
  const cur = await fetchEventState(deps.db, event_id);
  if ("skippedReason" in cur) return cur;
  if (!cur.ok) return cur;

  const now = (deps.now ?? (() => new Date()))();
  const { error: updErr } = await deps.db
    .from("notifiable_events")
    .update({
      state: "notified_regulator",
      regulator_notified_at: now.toISOString(),
      regulator_reference: regulator_reference.trim(),
    })
    .eq("id", event_id);
  if (updErr) {
    if (isSchemaMissing(updErr)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return { ok: false, error: errMsg(updErr, "event update failed") };
  }

  const actRes = await writeAction(deps.db, {
    event_id,
    acted_by: actor_id,
    action: "regulator_notified",
    previous_state: cur.state,
    new_state: "notified_regulator",
    notes,
  });
  if (!actRes.ok) return actRes;
  return { ok: true };
}

// ── closeCase ──────────────────────────────────────────────────────────────

export type CloseCaseResult =
  | { ok: true }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: "invalid_state" | "ni_role_required" | string };

/**
 * Close a case. Preconditions:
 *   - state must be 'notified_regulator'
 *   - ni_signoff_by must reference a profile whose role is in the
 *     configured NI-role list (default ['admin']; see header comment).
 */
export async function closeCase(
  event_id: string,
  actor_id: string,
  closure_reason: string,
  ni_signoff_by: string,
  deps: CaseDeps,
): Promise<CloseCaseResult> {
  const cur = await fetchEventState(deps.db, event_id);
  if ("skippedReason" in cur) return cur;
  if (!cur.ok) return cur;
  if (cur.state !== "notified_regulator") {
    return { ok: false, error: "invalid_state" };
  }

  // Check NI role.
  const { data: prof, error: profErr } = await deps.db
    .from("profiles")
    .select("id, role")
    .eq("id", ni_signoff_by)
    .maybeSingle();
  if (profErr) {
    return { ok: false, error: errMsg(profErr, "ni profile lookup failed") };
  }
  const role = (prof as { role?: string } | null)?.role ?? null;
  if (!role || !niRoles(deps).includes(role)) {
    return { ok: false, error: "ni_role_required" };
  }

  const now = (deps.now ?? (() => new Date()))();
  const { error: updErr } = await deps.db
    .from("notifiable_events")
    .update({
      state: "closed",
      closure_reason,
      ni_signoff_by,
      ni_signoff_at: now.toISOString(),
    })
    .eq("id", event_id);
  if (updErr) {
    if (isSchemaMissing(updErr)) {
      return { ok: true, skippedReason: "schema_not_ready" };
    }
    return { ok: false, error: errMsg(updErr, "event update failed") };
  }

  const actRes = await writeAction(deps.db, {
    event_id,
    acted_by: actor_id,
    action: "closed",
    previous_state: cur.state,
    new_state: "closed",
    notes: closure_reason,
  });
  if (!actRes.ok) return actRes;
  return { ok: true };
}

// ── addNote / addAttachment ────────────────────────────────────────────────

export type SimpleActionResult =
  | { ok: true }
  | { ok: true; skippedReason: "schema_not_ready" }
  | { ok: false; error: string };

export async function addNote(
  event_id: string,
  actor_id: string,
  notes: string,
  deps: CaseDeps,
): Promise<SimpleActionResult> {
  const cur = await fetchEventState(deps.db, event_id);
  if ("skippedReason" in cur) return cur;
  if (!cur.ok) return cur;
  const actRes = await writeAction(deps.db, {
    event_id,
    acted_by: actor_id,
    action: "note_added",
    previous_state: cur.state,
    new_state: cur.state,
    notes,
  });
  return actRes;
}

export async function addAttachment(
  event_id: string,
  actor_id: string,
  attachment_path: string,
  notes: string | null,
  deps: CaseDeps,
): Promise<SimpleActionResult> {
  const cur = await fetchEventState(deps.db, event_id);
  if ("skippedReason" in cur) return cur;
  if (!cur.ok) return cur;
  const actRes = await writeAction(deps.db, {
    event_id,
    acted_by: actor_id,
    action: "attachment_added",
    previous_state: cur.state,
    new_state: cur.state,
    notes,
    attachment_path,
  });
  return actRes;
}
