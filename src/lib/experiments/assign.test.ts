/**
 * Unit tests for the sticky-variant assigner (E3).
 *
 * Covers:
 *   • hash stability (repeat calls return the same variant)
 *   • ~50/50 split across a large sample
 *   • null for missing / inactive experiments
 *   • idempotent persistence (upsert with ignoreDuplicates:true)
 *   • honours a manually-forced pre-existing row (admin override)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  assignExperimentVariant,
  deriveVariant,
  hashInt,
} from "./assign";

// ─── Fake admin client (reused pattern from src/lib/mapbox/matrix.test.ts). ──

type Row = Record<string, unknown>;

function makeFake(initial?: {
  experiments?: Row[];
  assignments?: Row[];
}) {
  const state = {
    match_experiments: [...(initial?.experiments ?? [])] as Row[],
    match_experiment_assignments: [...(initial?.assignments ?? [])] as Row[],
  };

  function from(table: keyof typeof state) {
    const builder: {
      _filters: Record<string, unknown>;
      _table: keyof typeof state;
      select: (_cols?: string) => typeof builder;
      eq: (col: string, val: unknown) => typeof builder;
      maybeSingle: () => Promise<{ data: Row | null; error: null }>;
      upsert: (
        row: Row | Row[],
        opts?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) => Promise<{ data: null; error: null }>;
    } = {
      _filters: {},
      _table: table,
      select() {
        return builder;
      },
      eq(col, val) {
        builder._filters[col] = val;
        return builder;
      },
      async maybeSingle() {
        const rows = state[builder._table];
        const hit = rows.find((r) =>
          Object.entries(builder._filters).every(([k, v]) => r[k] === v),
        );
        return { data: (hit as Row) ?? null, error: null };
      },
      async upsert(row, opts) {
        const rows = state[builder._table];
        const inputRows = Array.isArray(row) ? row : [row];
        const conflictKeys = (opts?.onConflict ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const r of inputRows) {
          if (conflictKeys.length) {
            const idx = rows.findIndex((existing) =>
              conflictKeys.every((k) => existing[k] === r[k]),
            );
            if (idx >= 0) {
              if (opts?.ignoreDuplicates) {
                // keep existing untouched
                continue;
              }
              rows[idx] = { ...rows[idx], ...r };
            } else {
              rows.push({ ...r });
            }
          } else {
            rows.push({ ...r });
          }
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  return { admin: { from } as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, state };
}

// ─── Pure helpers ──────────────────────────────────────────────────────

describe("hashInt", () => {
  it("returns a non-negative int32", () => {
    for (const s of ["", "abc", "a".repeat(100), "😀"]) {
      const h = hashInt(s);
      assert.ok(Number.isInteger(h), `not int: ${h}`);
      assert.ok(h >= 0, `negative: ${h}`);
      assert.ok(h < 2 ** 32, `too large: ${h}`);
    }
  });

  it("is deterministic", () => {
    assert.equal(hashInt("hello:world"), hashInt("hello:world"));
  });
});

describe("deriveVariant", () => {
  it("returns 'control' or 'treatment' only", () => {
    for (let i = 0; i < 20; i++) {
      const v = deriveVariant("exp1", `booking-${i}`);
      assert.ok(v === "control" || v === "treatment");
    }
  });

  it("is sticky per (experiment, booking)", () => {
    const v1 = deriveVariant("commute_scoring_v1", "booking-42");
    const v2 = deriveVariant("commute_scoring_v1", "booking-42");
    assert.equal(v1, v2);
  });

  it("splits close to 50/50 across many bookings", () => {
    let control = 0;
    let treatment = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const v = deriveVariant("commute_scoring_v1", randomUUID());
      if (v === "control") control += 1;
      else treatment += 1;
    }
    // A fair coin has σ = √(N/4) ≈ 22 for N=2000. ±10% is
    // a very generous bound.
    const pct = control / N;
    assert.ok(pct > 0.4 && pct < 0.6, `split too skewed: ${pct}`);
  });
});

// ─── assignExperimentVariant ───────────────────────────────────────────

describe("assignExperimentVariant", () => {
  it("returns null when the experiment doesn't exist", async () => {
    const { admin } = makeFake();
    const v = await assignExperimentVariant("nope", "booking-1", { admin });
    assert.equal(v, null);
  });

  it("returns null when the experiment is inactive", async () => {
    const { admin } = makeFake({
      experiments: [{ id: "exp1", active: false }],
    });
    const v = await assignExperimentVariant("exp1", "booking-1", { admin });
    assert.equal(v, null);
  });

  it("assigns + persists on first call, then reads through the row on the second", async () => {
    const { admin, state } = makeFake({
      experiments: [{ id: "exp1", active: true }],
    });
    const v1 = await assignExperimentVariant("exp1", "booking-1", { admin });
    assert.ok(v1 === "control" || v1 === "treatment");
    assert.equal(state.match_experiment_assignments.length, 1);
    assert.equal(state.match_experiment_assignments[0].variant, v1);

    // Second call — must NOT insert a new row, must return the same variant.
    const v2 = await assignExperimentVariant("exp1", "booking-1", { admin });
    assert.equal(v2, v1);
    assert.equal(state.match_experiment_assignments.length, 1);
  });

  it("is stable across repeat calls (100 x)", async () => {
    const { admin } = makeFake({
      experiments: [{ id: "exp1", active: true }],
    });
    const first = await assignExperimentVariant("exp1", "sticky-me", {
      admin,
    });
    for (let i = 0; i < 100; i++) {
      const v = await assignExperimentVariant("exp1", "sticky-me", { admin });
      assert.equal(v, first);
    }
  });

  it("honours a manually-forced assignment row (admin override)", async () => {
    // Even if hashInt would say 'control', a pre-existing 'treatment'
    // row wins.
    const forcedVariant: "control" | "treatment" =
      deriveVariant("exp1", "forced-booking") === "control"
        ? "treatment"
        : "control";
    const { admin } = makeFake({
      experiments: [{ id: "exp1", active: true }],
      assignments: [
        {
          experiment_id: "exp1",
          subject_id: "forced-booking",
          variant: forcedVariant,
        },
      ],
    });
    const v = await assignExperimentVariant("exp1", "forced-booking", {
      admin,
    });
    assert.equal(v, forcedVariant);
  });
});
