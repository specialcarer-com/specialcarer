/**
 * Sticky variant assignment for matching-engine experiments (E3).
 *
 * Given (experimentId, bookingId) return `'control' | 'treatment' | null`.
 *
 *   • `null` when the experiment doesn't exist or is inactive. Callers
 *     treat null as "no experiment applies" and fall through to the
 *     control-code path.
 *
 *   • Otherwise: a sticky hash-derived variant. `hashInt(bookingId +
 *     experimentId) % 2` maps evenly to control/treatment. Persisted
 *     into `match_experiment_assignments` on first call, then read
 *     back from that row on every subsequent call — the hash is only
 *     ever consulted when the row doesn't exist yet, so an admin who
 *     manually forced an assignment (SQL insert) stays honoured.
 *
 * Idempotent: upsert-with-onConflict-do-nothing means racing writers
 * for the same (experiment_id, booking_id) always agree on the
 * variant that was first written.
 *
 * No `server-only` import — the module is safe to unit-test via
 * dependency injection.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Public types ──────────────────────────────────────────────────────

export type Variant = "control" | "treatment";

export type AssignExperimentDeps = {
  admin?: ReturnType<typeof createAdminClient>;
};

// ─── Hash ──────────────────────────────────────────────────────────────

/**
 * djb2-ish 32-bit integer hash. Deterministic, no crypto (we don't
 * need cryptographic strength for a 2-arm split; we need speed +
 * stability). Uses `Math.imul` to stay within int32 semantics.
 *
 * Exported for the unit test; not intended for external consumers.
 */
export function hashInt(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  }
  // Ensure a non-negative int by masking the sign bit.
  return h >>> 0;
}

/**
 * Pure variant derivation from (experimentId, bookingId). Exported for
 * the unit test — callers should use `assignExperimentVariant` so the
 * assignment is persisted.
 */
export function deriveVariant(
  experimentId: string,
  bookingId: string,
): Variant {
  return hashInt(bookingId + experimentId) % 2 === 0 ? "control" : "treatment";
}

// ─── Main entry ────────────────────────────────────────────────────────

/**
 * Return the sticky variant for (experimentId, bookingId), or null if
 * the experiment isn't active. Persists a new row on first call for
 * an unseen booking.
 *
 * Any DB error returns null (fail-open — the caller treats null as
 * "no experiment applies" and runs the control code path). We
 * deliberately do not propagate errors because auto-match calls this
 * on the hot path.
 */
export async function assignExperimentVariant(
  experimentId: string,
  bookingId: string,
  deps: AssignExperimentDeps = {},
): Promise<Variant | null> {
  const admin = deps.admin ?? createAdminClient();

  // 1. Is the experiment registered + active?
  let active = false;
  try {
    const { data, error } = await admin
      .from("match_experiments")
      .select("id, active")
      .eq("id", experimentId)
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    active = data.active === true;
  } catch {
    return null;
  }
  if (!active) return null;

  // 2. Do we already have a sticky assignment?
  try {
    const { data: existing, error: existingErr } = await admin
      .from("match_experiment_assignments")
      .select("variant")
      .eq("experiment_id", experimentId)
      .eq("subject_id", bookingId)
      .maybeSingle();
    if (!existingErr && existing) {
      const v = existing.variant as string;
      if (v === "control" || v === "treatment") return v;
    }
  } catch {
    // fall through — we'll try to insert below.
  }

  // 3. Derive + persist.
  const variant = deriveVariant(experimentId, bookingId);
  try {
    // ignoreDuplicates:true so a racing writer that already inserted a
    // row (possibly with a different variant if an admin manually
    // forced one) doesn't get overwritten.
    await admin.from("match_experiment_assignments").upsert(
      {
        experiment_id: experimentId,
        subject_id: bookingId,
        variant,
      },
      { onConflict: "experiment_id,subject_id", ignoreDuplicates: true },
    );
  } catch {
    // Non-fatal. We still return the derived variant so the caller
    // makes a decision; a follow-up call will retry the write.
  }

  // 4. Re-read to make sure we return whatever ended up persisted
  //    (handles the "racing writer with a forced variant" case).
  try {
    const { data: after } = await admin
      .from("match_experiment_assignments")
      .select("variant")
      .eq("experiment_id", experimentId)
      .eq("subject_id", bookingId)
      .maybeSingle();
    if (after) {
      const v = after.variant as string;
      if (v === "control" || v === "treatment") return v;
    }
  } catch {
    // Fall through to the locally derived variant.
  }

  return variant;
}
