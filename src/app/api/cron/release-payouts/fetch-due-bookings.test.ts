/**
 * Tests for the payout-eligibility fetch that honours
 * `bookings.carer_payout_hold_reason` (PR #218 dispute workflow).
 *
 * Covers:
 *   1. Held bookings (dispute_open / dbs_expired / any non-null reason)
 *      are excluded; only the NULL-reason booking is returned.
 *   2. Schema-not-ready fallback: when the column is missing (migration
 *      unapplied), the helper logs the documented warning and falls
 *      back to the un-filtered query so payouts keep running unchanged.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fetchDueBookings,
  type DueBookingsAdminClient,
} from "./fetch-due-bookings";

type Bkg = {
  id: string;
  status: string;
  booking_source: string;
  payout_eligible_at: string;
  carer_payout_hold_reason: string | null;
};

type MakeAdminOpts = {
  bookings: Bkg[];
  /** If true, the filtered query fails with 42703 undefined_column. */
  simulateColumnMissing?: boolean;
  /** Captures whether the fallback (un-filtered) query was hit. */
  onFallback?: () => void;
};

/**
 * Minimal Supabase-JS-like builder. Chains .eq / .neq / .lte / .is
 * against a fresh row set and awaits into a Postgrest-shaped result.
 */
function makeAdmin(opts: MakeAdminOpts): DueBookingsAdminClient {
  return {
    from() {
      // We track whether the chain included .is('carer_payout_hold_reason', null).
      // The first (filtered) call includes it; the fallback call does not.
      let filteredByHold = false;
      const state: {
        rows: Bkg[];
        error: { code?: string; message: string } | null;
      } = {
        rows: [...opts.bookings],
        error: null,
      };
      const chain = {
        select(_cols: string) {
          return chain;
        },
        eq(col: keyof Bkg, val: unknown) {
          state.rows = state.rows.filter((r) => r[col] === val);
          return chain;
        },
        neq(col: keyof Bkg, val: unknown) {
          state.rows = state.rows.filter((r) => r[col] !== val);
          return chain;
        },
        lte(col: keyof Bkg, val: string) {
          state.rows = state.rows.filter(
            (r) => (r[col] as string | null) !== null && (r[col] as string) <= val,
          );
          return chain;
        },
        is(col: keyof Bkg, val: null) {
          filteredByHold = col === "carer_payout_hold_reason" && val === null;
          if (filteredByHold && opts.simulateColumnMissing) {
            state.error = {
              code: "42703",
              message:
                "column bookings.carer_payout_hold_reason does not exist",
            };
            return chain;
          }
          state.rows = state.rows.filter((r) => r[col] === val);
          return chain;
        },
        limit(_n: number) {
          if (!filteredByHold) {
            opts.onFallback?.();
          }
          if (state.error) {
            return Promise.resolve({ data: null, error: state.error });
          }
          return Promise.resolve({ data: state.rows, error: null });
        },
      };
      return chain;
    },
  };
}

// A time earlier than any of the fixture payout_eligible_at values.
const NOW = "2026-09-12T14:00:00.000Z";

const BASE_BOOKINGS: Bkg[] = [
  {
    id: "b-null",
    status: "completed",
    booking_source: "seeker",
    payout_eligible_at: "2026-09-11T00:00:00.000Z",
    carer_payout_hold_reason: null,
  },
  {
    id: "b-dispute",
    status: "completed",
    booking_source: "seeker",
    payout_eligible_at: "2026-09-11T00:00:00.000Z",
    carer_payout_hold_reason: "dispute_open",
  },
  {
    id: "b-dbs",
    status: "completed",
    booking_source: "seeker",
    payout_eligible_at: "2026-09-11T00:00:00.000Z",
    carer_payout_hold_reason: "dbs_expired",
  },
];

describe("fetchDueBookings — carer_payout_hold_reason filter", () => {
  it("excludes held bookings and returns only the null-reason booking", async () => {
    const admin = makeAdmin({ bookings: BASE_BOOKINGS });
    const result = await fetchDueBookings(admin, NOW);

    assert.equal(result.error, null);
    assert.equal(result.holdFilterSkipped, false);
    const ids = (result.data ?? []).map((b) => b.id).sort();
    assert.deepEqual(
      ids,
      ["b-null"],
      "must include ONLY the booking with carer_payout_hold_reason = NULL",
    );
  });

  it("deploy-safe fallback: column missing → logs warning, falls back, releases all payouts", async () => {
    let fallbackHit = false;
    const admin = makeAdmin({
      bookings: BASE_BOOKINGS,
      simulateColumnMissing: true,
      onFallback: () => {
        fallbackHit = true;
      },
    });

    // Capture the documented warning.
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const result = await fetchDueBookings(admin, NOW);

      assert.equal(result.error, null, "worker still runs on schema-missing");
      assert.equal(
        result.holdFilterSkipped,
        true,
        "signals that the hold filter was skipped",
      );
      assert.equal(fallbackHit, true, "fallback query executed");

      // All three bookings released (pre-#218 behaviour, unchanged).
      const ids = (result.data ?? []).map((b) => b.id).sort();
      assert.deepEqual(ids, ["b-dbs", "b-dispute", "b-null"]);

      // The exact documented warning surfaced.
      assert.ok(
        warnings.some((w) =>
          w.includes(
            "carer_payout_hold_reason column not yet applied — payout hold inactive",
          ),
        ),
        "logs the deploy-safe warning verbatim",
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
