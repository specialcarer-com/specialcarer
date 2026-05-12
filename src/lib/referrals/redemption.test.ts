import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMaxApplicableCents,
  applyCreditToBooking,
  unredeemCreditsForBooking,
} from "./redemption";

/**
 * In-memory supabase shim tuned for the redemption module. Adds `.is(col,
 * null)` filter support and `.select().single()` on insert returns the
 * inserted row — both used by redemption.ts.
 */
type Row = Record<string, unknown>;

function makeMock() {
  const tables: Record<string, Row[]> = {
    bookings: [],
    referral_credits: [],
  };
  let creditIdSeq = 1;
  let nextCreditId: string | null = null;

  function chainable(name: string) {
    let mode: "select" | "insert" | "update" = "select";
    const filters: Array<(r: Row) => boolean> = [];
    let payload: Row | Row[] | undefined;
    let returningInserted = false;
    let returningSingle = false;

    const builder = {
      select(_cols?: string) {
        returningInserted = true;
        return builder;
      },
      insert(rows: Row | Row[]) {
        mode = "insert";
        payload = rows;
        return builder;
      },
      update(p: Row) {
        mode = "update";
        payload = p;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      is(col: string, val: null) {
        filters.push((r) => r[col] == val);
        return builder;
      },
      maybeSingle: async () => doRun(true),
      single: async () => {
        returningSingle = true;
        return doRun(true);
      },
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
        if (single) return { data: matches[0] ?? null, error: null };
        return { data: matches, error: null };
      }
      if (mode === "insert") {
        const rows = Array.isArray(payload) ? payload : [payload as Row];
        const inserted: Row[] = [];
        for (const r of rows) {
          const id =
            (r.id as string | undefined) ??
            nextCreditId ??
            `${name}-${creditIdSeq++}`;
          nextCreditId = null;
          const row = { ...r, id };
          list.push(row);
          inserted.push(row);
        }
        if (returningInserted || single) {
          return { data: single ? inserted[0] ?? null : inserted, error: null };
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
      throw new Error(`unhandled mode ${mode}`);
    }
    return builder;
  }

  const admin = {
    from(name: string) {
      return chainable(name);
    },
  };

  function addBooking(b: Partial<Row> & { id: string; seeker_id: string; total_cents: number; status: string }) {
    tables.bookings.push({
      referral_credit_applied_cents: 0,
      referral_credit_applied_at: null,
      ...b,
    });
  }

  // Helper: insert a credit with controlled created_at so FIFO ordering
  // is deterministic regardless of test wall-clock.
  function addCredit(c: Partial<Row> & {
    id?: string;
    user_id: string;
    claim_id: string;
    amount_cents: number;
    currency?: string;
    reason?: string;
    redeemed_at?: string | null;
    redeemed_booking_id?: string | null;
    expires_at: string;
    created_at: string;
  }) {
    tables.referral_credits.push({
      currency: "GBP",
      reason: "referrer_reward",
      redeemed_at: null,
      redeemed_booking_id: null,
      ...c,
      id: c.id ?? `cr-${creditIdSeq++}`,
    });
  }

  return {
    admin: admin as unknown as Parameters<typeof applyCreditToBooking>[0]["supabase"],
    tables,
    addBooking,
    addCredit,
  };
}

const FUTURE = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
const PAST = new Date(Date.now() - 1 * 86400 * 1000).toISOString();

describe("referrals/redemption — computeMaxApplicableCents", () => {
  it("returns balance when balance is below the 50% cap", () => {
    // booking £80 → cap = £40. balance £10 → max £10.
    assert.equal(computeMaxApplicableCents(8000, 1000), 1000);
  });

  it("returns the 50% cap when balance exceeds it", () => {
    // booking £80 → cap £40. balance £100 → max £40.
    assert.equal(computeMaxApplicableCents(8000, 10000), 4000);
  });

  it("returns 0 for zero or negative balance / total", () => {
    assert.equal(computeMaxApplicableCents(8000, 0), 0);
    assert.equal(computeMaxApplicableCents(0, 1000), 0);
    assert.equal(computeMaxApplicableCents(-100, 1000), 0);
    assert.equal(computeMaxApplicableCents(1000, -100), 0);
  });

  it("floors odd totals down to the nearest cent", () => {
    // £79.99 total → cap = floor(7999 * 0.5) = 3999.
    assert.equal(computeMaxApplicableCents(7999, 10000), 3999);
  });
});

describe("referrals/redemption — applyCreditToBooking", () => {
  it("FIFO-consumes 2 of 3 credits when partial coverage of the third is needed", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000, // cap = 5000
      status: "accepted",
    });
    // Three £20 credits totalling £60 — oldest first.
    m.addCredit({
      id: "c-old",
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    m.addCredit({
      id: "c-mid",
      user_id: "u1",
      claim_id: "k2",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-02-01T00:00:00Z",
    });
    m.addCredit({
      id: "c-new",
      user_id: "u1",
      claim_id: "k3",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-03-01T00:00:00Z",
    });

    // Apply the max — should be 5000 cents (50% cap), needing 2 full
    // credits + 1 partial (1000c) which triggers a split on c-new.
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.appliedCents, 5000);
    assert.equal(r.value.newTotalCents, 5000);

    const oldRow = m.tables.referral_credits.find((c) => c.id === "c-old");
    const midRow = m.tables.referral_credits.find((c) => c.id === "c-mid");
    const newRow = m.tables.referral_credits.find((c) => c.id === "c-new");
    assert.ok(oldRow?.redeemed_at, "oldest credit redeemed");
    assert.ok(midRow?.redeemed_at, "middle credit redeemed");
    assert.equal(newRow?.amount_cents, 1000, "newest shrinks to leftover 1000c");
    assert.equal(newRow?.redeemed_at, null, "newest leftover stays unredeemed");

    // A NEW adjustment row should exist for the consumed portion (1000c)
    // tagged to claim k3 with reason='adjustment'.
    const adj = m.tables.referral_credits.find(
      (c) =>
        c.claim_id === "k3" &&
        c.reason === "adjustment" &&
        c.amount_cents === 1000,
    );
    assert.ok(adj, "split adjustment row inserted");
    assert.equal((adj as Row).redeemed_booking_id, "b1");

    const booking = m.tables.bookings.find((b) => b.id === "b1");
    assert.equal(booking?.referral_credit_applied_cents, 5000);
  });

  it("respects the 50% cap when balance >> cap", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 4000, // cap 2000
      status: "accepted",
    });
    m.addCredit({
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 10000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
      requestedCents: 9999,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.appliedCents, 2000, "capped at 50% of total");
    assert.equal(r.value.newTotalCents, 2000);
  });

  it("excludes expired credits from the eligible pool", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "accepted",
    });
    m.addCredit({
      id: "c-expired",
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 5000,
      expires_at: PAST,
      created_at: "2025-01-01T00:00:00Z",
    });
    m.addCredit({
      id: "c-live",
      user_id: "u1",
      claim_id: "k2",
      amount_cents: 1500,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.appliedCents, 1500, "only the live credit counts");
    const expired = m.tables.referral_credits.find((c) => c.id === "c-expired");
    assert.equal(expired?.redeemed_at, null, "expired stays untouched");
  });

  it("blocks a second apply on the same booking (idempotency)", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "accepted",
    });
    m.addCredit({
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    m.addCredit({
      user_id: "u1",
      claim_id: "k2",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-02-01T00:00:00Z",
    });
    const first = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
      requestedCents: 2000,
    });
    assert.equal(first.ok, true);
    const second = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
      requestedCents: 2000,
    });
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.error.code, "already_applied");
  });

  it("caps requestedCents > available at the available balance", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000, // cap 5000
      status: "accepted",
    });
    m.addCredit({
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 1500,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
      requestedCents: 9999,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.appliedCents, 1500);
  });

  it("rejects if booking is in a non-pre-payment status", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "paid",
    });
    m.addCredit({
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 5000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, "invalid_status");
  });

  it("rejects when seeker_id does not match the authenticated user", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "accepted",
    });
    m.addCredit({
      user_id: "u2",
      claim_id: "k1",
      amount_cents: 5000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u2",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, "forbidden");
  });
});

describe("referrals/redemption — unredeemCreditsForBooking", () => {
  it("restores non-expired credits and zeroes the booking counter", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "accepted",
      referral_credit_applied_cents: 2000,
      referral_credit_applied_at: "2026-03-10T10:00:00Z",
    });
    m.addCredit({
      id: "c1",
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
      redeemed_at: "2026-03-10T10:00:00Z",
      redeemed_booking_id: "b1",
    });
    const r = await unredeemCreditsForBooking({
      supabase: m.admin,
      bookingId: "b1",
    });
    assert.equal(r.unredeemedCents, 2000);
    assert.deepEqual(r.restoredCreditIds, ["c1"]);
    const c = m.tables.referral_credits.find((x) => x.id === "c1");
    assert.equal(c?.redeemed_at, null);
    assert.equal(c?.redeemed_booking_id, null);
    const b = m.tables.bookings.find((x) => x.id === "b1");
    assert.equal(b?.referral_credit_applied_cents, 0);
    assert.equal(b?.referral_credit_applied_at, null);
  });

  it("leaves expired-while-spent credits redeemed (no resurrection)", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "accepted",
      referral_credit_applied_cents: 4000,
    });
    m.addCredit({
      id: "c-expired",
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 2000,
      expires_at: PAST,
      created_at: "2025-01-01T00:00:00Z",
      redeemed_at: "2026-03-10T10:00:00Z",
      redeemed_booking_id: "b1",
    });
    m.addCredit({
      id: "c-live",
      user_id: "u1",
      claim_id: "k2",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
      redeemed_at: "2026-03-10T10:00:00Z",
      redeemed_booking_id: "b1",
    });
    const r = await unredeemCreditsForBooking({
      supabase: m.admin,
      bookingId: "b1",
    });
    assert.equal(r.unredeemedCents, 2000, "only the live credit restored");
    const expired = m.tables.referral_credits.find((x) => x.id === "c-expired");
    assert.equal(
      expired?.redeemed_at,
      "2026-03-10T10:00:00Z",
      "expired credit stays spent",
    );
    const live = m.tables.referral_credits.find((x) => x.id === "c-live");
    assert.equal(live?.redeemed_at, null);
  });

  it("is idempotent — calling twice returns the same end state", async () => {
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 10000,
      status: "accepted",
      referral_credit_applied_cents: 2000,
    });
    m.addCredit({
      id: "c1",
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 2000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
      redeemed_at: "2026-03-10T10:00:00Z",
      redeemed_booking_id: "b1",
    });
    const first = await unredeemCreditsForBooking({
      supabase: m.admin,
      bookingId: "b1",
    });
    const second = await unredeemCreditsForBooking({
      supabase: m.admin,
      bookingId: "b1",
    });
    assert.equal(first.unredeemedCents, 2000);
    assert.equal(second.unredeemedCents, 0, "second call is a no-op");
    assert.equal(second.restoredCreditIds.length, 0);
  });
});

describe("referrals/redemption — carer payout invariant", () => {
  it("does not mutate bookings.total_cents when credit is applied (platform absorbs)", async () => {
    // This is the critical invariant for the payroll pipeline: the carer
    // is paid on the pre-credit total. The payout engine reads
    // bookings.total_cents (and carer_pay_total_cents) directly — if
    // applyCreditToBooking ever lowered total_cents, the carer would be
    // short-paid.
    const m = makeMock();
    m.addBooking({
      id: "b1",
      seeker_id: "u1",
      total_cents: 8000,
      status: "accepted",
    });
    m.addCredit({
      user_id: "u1",
      claim_id: "k1",
      amount_cents: 4000,
      expires_at: FUTURE,
      created_at: "2026-01-01T00:00:00Z",
    });
    const r = await applyCreditToBooking({
      supabase: m.admin,
      bookingId: "b1",
      userId: "u1",
    });
    assert.equal(r.ok, true);
    const b = m.tables.bookings.find((x) => x.id === "b1");
    // total_cents UNCHANGED — only the seeker-facing intent amount is reduced.
    assert.equal(b?.total_cents, 8000, "carer payout base preserved");
    assert.equal(b?.referral_credit_applied_cents, 4000);
  });
});
