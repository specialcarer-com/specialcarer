import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  recordClaim,
  qualifyClaim,
  getOrCreateReferralCode,
  findPendingClaimForUser,
} from "./engine";
import { REFERRAL_REWARD_CENTS } from "./config";

/**
 * Minimal in-memory shim of the supabase-js builder surface used by the
 * referral engine. Only the methods the engine touches are implemented —
 * everything else throws so coverage gaps fail loudly.
 *
 * Tables modelled:
 *   referral_codes      ({ user_id, code, created_at })
 *   referral_claims     ({ id, code, referrer_id, referred_id, status,
 *                          signed_up_at, expires_at,
 *                          qualifying_booking_id, qualified_at })
 *   referral_credits    ({ id, user_id, claim_id, amount_cents, currency,
 *                          reason, created_at, expires_at })
 */
type Row = Record<string, unknown>;
function makeMock() {
  const tables: Record<string, Row[]> = {
    referral_codes: [],
    referral_claims: [],
    referral_credits: [],
  };

  function chainable(name: string) {
    let mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let filters: Array<(r: Row) => boolean> = [];
    let payload: Row | Row[] | undefined;
    let onConflict: string | null = null;
    let ignoreDuplicates = false;

    const builder = {
      select(_cols?: string) {
        return builder;
      },
      insert(rows: Row | Row[]) {
        mode = "insert";
        payload = rows;
        return builder;
      },
      upsert(
        rows: Row | Row[],
        opts?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) {
        mode = "upsert";
        payload = rows;
        onConflict = opts?.onConflict ?? null;
        ignoreDuplicates = !!opts?.ignoreDuplicates;
        return builder;
      },
      update(p: Row) {
        mode = "update";
        payload = p;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      maybeSingle: async () => doRun(/*single*/ true),
      single: async () => doRun(true),
      // Thenable: lets `await admin.from(t).insert/update/upsert/delete()`
      // resolve to `{ data, error }` like the real supabase-js builder.
      then: (
        onFulfilled: (v: {
          data: Row | Row[] | null;
          error: { message: string } | null;
        }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => doRun(false).then(onFulfilled, onRejected),
    };

    async function doRun(single: boolean) {
      const list = tables[name];
      if (!list) {
        return { data: null, error: { message: `unknown table ${name}` } };
      }
      if (mode === "select") {
        const matches = list.filter((r) => filters.every((f) => f(r)));
        if (single) {
          return { data: matches[0] ?? null, error: null };
        }
        return { data: matches, error: null };
      }
      if (mode === "insert") {
        const rows = Array.isArray(payload) ? payload : [payload as Row];
        const inserted: Row[] = [];
        for (const r of rows) {
          // Crude UNIQUE enforcement based on known columns.
          if (name === "referral_codes") {
            if (
              list.some(
                (x) => x.code === r.code || x.user_id === r.user_id,
              )
            ) {
              return {
                data: null,
                error: { message: "duplicate key value" },
              };
            }
          }
          if (name === "referral_claims") {
            if (list.some((x) => x.referred_id === r.referred_id)) {
              return {
                data: null,
                error: { message: "duplicate referred_id" },
              };
            }
          }
          const row = {
            id: r.id ?? `${name}-${list.length + 1}`,
            ...r,
          };
          list.push(row);
          inserted.push(row);
        }
        if (single) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }
      if (mode === "upsert") {
        const rows = Array.isArray(payload) ? payload : [payload as Row];
        const keyCols = onConflict?.split(",") ?? [];
        for (const r of rows) {
          const existing = list.find((x) =>
            keyCols.every((k) => x[k] === r[k]),
          );
          if (existing) {
            if (ignoreDuplicates) continue;
            Object.assign(existing, r);
          } else {
            const row = { id: `${name}-${list.length + 1}`, ...r };
            list.push(row);
          }
        }
        return { data: null, error: null };
      }
      if (mode === "update") {
        for (const r of list) {
          if (filters.every((f) => f(r))) {
            Object.assign(r, payload as Row);
          }
        }
        return { data: null, error: null };
      }
      if (mode === "delete") {
        for (let i = list.length - 1; i >= 0; i--) {
          if (filters.every((f) => f(list[i]))) {
            list.splice(i, 1);
          }
        }
        return { data: null, error: null };
      }
      throw new Error(`unhandled mode ${mode}`);
    }

    return builder;
  }

  const admin = {
    from(name: string) {
      return chainable(name);
    },
  };
  // The engine type-asserts the supabase client; the in-memory shape is
  // structurally similar enough for the methods we exercise.
  return { admin: admin as unknown as Parameters<typeof recordClaim>[0], tables };
}

describe("referrals/engine — getOrCreateReferralCode", () => {
  it("creates a row on first call, returns the same code on second", async () => {
    const { admin, tables } = makeMock();
    const a = await getOrCreateReferralCode(
      admin,
      "user-1",
      "Steve Reynolds",
    );
    const b = await getOrCreateReferralCode(
      admin,
      "user-1",
      "Steve Reynolds",
    );
    assert.equal(a, b);
    assert.equal(tables.referral_codes.length, 1);
  });
});

describe("referrals/engine — recordClaim", () => {
  it("blocks self-referral", async () => {
    const { admin, tables } = makeMock();
    const code = await getOrCreateReferralCode(admin, "user-A", "Alice");
    const res = await recordClaim(admin, {
      code,
      referredUserId: "user-A",
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 400);
      assert.match(res.error, /yourself/i);
    }
    assert.equal(tables.referral_claims.length, 0);
  });

  it("blocks a second claim by the same referee", async () => {
    const { admin, tables } = makeMock();
    const code = await getOrCreateReferralCode(admin, "user-A", "Alice");
    const first = await recordClaim(admin, {
      code,
      referredUserId: "user-B",
    });
    assert.equal(first.ok, true);
    const second = await recordClaim(admin, {
      code,
      referredUserId: "user-B",
    });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, 409);
    assert.equal(tables.referral_claims.length, 1);
  });

  it("returns pending + £20 on the happy path", async () => {
    const { admin } = makeMock();
    const code = await getOrCreateReferralCode(admin, "user-A", "Alice");
    const res = await recordClaim(admin, {
      code,
      referredUserId: "user-C",
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.status, "pending");
      assert.equal(res.amount_cents, REFERRAL_REWARD_CENTS);
    }
  });
});

describe("referrals/engine — qualifyClaim", () => {
  it("writes 2 credits (referrer + referee) and is idempotent on re-run", async () => {
    const { admin, tables } = makeMock();
    const code = await getOrCreateReferralCode(admin, "user-A", "Alice");
    const claim = await recordClaim(admin, {
      code,
      referredUserId: "user-B",
    });
    assert.equal(claim.ok, true);
    if (!claim.ok) return;

    const r1 = await qualifyClaim(admin, {
      claimId: claim.claim_id,
      bookingId: "booking-1",
    });
    assert.equal(r1.ok, true);
    assert.equal(tables.referral_credits.length, 2);
    const reasons = tables.referral_credits.map((c) => c.reason).sort();
    assert.deepEqual(reasons, ["referee_reward", "referrer_reward"]);

    // Second call must not double-write thanks to onConflict.
    const r2 = await qualifyClaim(admin, {
      claimId: claim.claim_id,
      bookingId: "booking-1",
    });
    assert.equal(r2.ok, true);
    assert.equal(
      tables.referral_credits.length,
      2,
      "idempotent: no second pair of credits",
    );
  });

  it("findPendingClaimForUser returns the active pending claim", async () => {
    const { admin } = makeMock();
    const code = await getOrCreateReferralCode(admin, "user-A", "Alice");
    await recordClaim(admin, { code, referredUserId: "user-X" });
    const found = await findPendingClaimForUser(admin, "user-X");
    assert.ok(found);
  });
});
