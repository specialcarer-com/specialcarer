import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  handleDisputeEvent,
  markEvidenceSubmitted,
  type DisputeAdminClient,
  type DisputeCaseState,
} from "./dispute-webhook";

// ─────────────────────────────────────────────────────────────────────────────
// Fake admin client — in-memory tables for stripe_dispute_cases, refund_ledger,
// bookings and payments. Just enough surface to satisfy the handler's
// PostgREST-shaped calls (.from().select().eq().maybeSingle(), .insert(),
// .update().eq(), .upsert()).
// ─────────────────────────────────────────────────────────────────────────────

type CaseRow = {
  id: string;
  booking_id: string | null;
  stripe_charge_id: string | null;
  stripe_dispute_id: string;
  state: DisputeCaseState;
  reason: string | null;
  amount_cents: number | null;
  currency: string | null;
  evidence_due_at: string | null;
  opened_at: string;
  resolved_at: string | null;
  notes: string | null;
  updated_at?: string;
};

type BookingRow = {
  id: string;
  carer_payout_hold_reason: string | null;
  status?: string;
};

type PaymentRow = {
  booking_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
};

type LedgerRow = {
  booking_id: string;
  stripe_refund_id: string;
  event_type: string;
  amount_cents: number;
  currency: string;
  status: string;
  reason: string | null;
  raw: Record<string, unknown>;
};

type FakeState = {
  cases: CaseRow[];
  bookings: BookingRow[];
  payments: PaymentRow[];
  ledger: LedgerRow[];
  /** If set, all admin calls surface this error instead of executing. */
  simulate?: {
    kind: "cases_missing" | "ledger_missing" | "hold_col_missing";
  };
};

function newId(prefix = "id_") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

function makeAdmin(state: FakeState): DisputeAdminClient {
  function tableFor(name: string) {
    // Table missing errors are Postgres 42P01. Column missing is 42703.
    if (state.simulate?.kind === "cases_missing" && name === "stripe_dispute_cases") {
      return schemaMissingTable("stripe_dispute_cases");
    }
    if (state.simulate?.kind === "ledger_missing" && name === "refund_ledger") {
      return schemaMissingTable("refund_ledger");
    }
    if (state.simulate?.kind === "hold_col_missing" && name === "bookings") {
      return schemaMissingColumn("carer_payout_hold_reason");
    }
    switch (name) {
      case "stripe_dispute_cases":
        return casesTable(state);
      case "bookings":
        return bookingsTable(state);
      case "payments":
        return paymentsTable(state);
      case "refund_ledger":
        return ledgerTable(state);
      default:
        return emptyTable();
    }
  }
  return {
    from(name: string) {
      return tableFor(name);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schemaMissingTable(name: string): any {
  const error = { code: "42P01", message: `relation "${name}" does not exist` };
  const failure = { data: null, error };
  return {
    select() {
      return {
        eq() {
          return {
            maybeSingle: async () => failure,
          };
        },
      };
    },
    insert() {
      return { select: () => ({ maybeSingle: async () => failure }) };
    },
    upsert() {
      return { select: () => ({ maybeSingle: async () => failure }) };
    },
    update() {
      return { eq: async () => failure };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schemaMissingColumn(column: string): any {
  const error = {
    code: "42703",
    message: `column bookings.${column} does not exist`,
  };
  const failure = { data: null, error };
  return {
    select() {
      return {
        eq() {
          return { maybeSingle: async () => failure };
        },
      };
    },
    update() {
      return {
        eq() {
          return {
            is: async () => failure,
            eq: async () => failure,
            then: (resolve: (v: unknown) => void) => resolve(failure),
          };
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emptyTable(): any {
  return {
    select() {
      return {
        eq() {
          return { maybeSingle: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function casesTable(state: FakeState): any {
  return {
    select() {
      return {
        eq(_col: string, val: string) {
          return {
            maybeSingle: async () => {
              const row =
                state.cases.find((r) => r.stripe_dispute_id === val) ??
                state.cases.find((r) => r.id === val) ??
                null;
              // Return only the columns commonly requested. Fake DB doesn't
              // enforce column projection.
              return { data: row, error: null };
            },
          };
        },
      };
    },
    upsert(row: Record<string, unknown>) {
      // Simulate onConflict on stripe_dispute_id.
      const disputeId = row.stripe_dispute_id as string;
      const existingIdx = state.cases.findIndex(
        (r) => r.stripe_dispute_id === disputeId,
      );
      let out: CaseRow;
      if (existingIdx >= 0) {
        out = { ...state.cases[existingIdx], ...(row as Partial<CaseRow>) };
        state.cases[existingIdx] = out;
      } else {
        out = {
          id: (row.id as string) ?? newId("case_"),
          booking_id: (row.booking_id as string | null) ?? null,
          stripe_charge_id: (row.stripe_charge_id as string | null) ?? null,
          stripe_dispute_id: disputeId,
          state: (row.state as DisputeCaseState) ?? "opened",
          reason: (row.reason as string | null) ?? null,
          amount_cents: (row.amount_cents as number | null) ?? null,
          currency: (row.currency as string | null) ?? null,
          evidence_due_at: (row.evidence_due_at as string | null) ?? null,
          opened_at: new Date().toISOString(),
          resolved_at: (row.resolved_at as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
        };
        state.cases.push(out);
      }
      return {
        select() {
          return {
            maybeSingle: async () => ({ data: { id: out.id }, error: null }),
          };
        },
      };
    },
    update(patch: Record<string, unknown>) {
      return {
        eq(col: string, val: string) {
          const filters: Array<[string, unknown]> = [[col, val]];
          const chain = {
            eq(c2: string, v2: string) {
              filters.push([c2, v2]);
              runUpdate();
              return { then: (r: (v: unknown) => void) => r({ error: null }) };
            },
            in(c2: string, arr: string[]) {
              filters.push([c2, arr]);
              runUpdate();
              return { then: (r: (v: unknown) => void) => r({ error: null }) };
            },
            then(resolve: (v: unknown) => void) {
              runUpdate();
              resolve({ error: null });
            },
          };

          function runUpdate() {
            for (let i = 0; i < state.cases.length; i++) {
              const row = state.cases[i];
              let matches = true;
              for (const [c, v] of filters) {
                if (Array.isArray(v)) {
                  if (!v.includes((row as unknown as Record<string, unknown>)[c] as string))
                    matches = false;
                } else {
                  if ((row as unknown as Record<string, unknown>)[c] !== v) matches = false;
                }
              }
              if (matches) {
                state.cases[i] = { ...row, ...(patch as Partial<CaseRow>) };
              }
            }
          }
          return chain;
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bookingsTable(state: FakeState): any {
  return {
    select() {
      return {
        eq(_col: string, val: string) {
          return {
            maybeSingle: async () => ({
              data:
                state.bookings.find((b) => b.id === val)
                  ? {
                      carer_payout_hold_reason:
                        state.bookings.find((b) => b.id === val)!
                          .carer_payout_hold_reason,
                    }
                  : null,
              error: null,
            }),
          };
        },
      };
    },
    update(patch: Record<string, unknown>) {
      return {
        eq(_c1: string, id: string) {
          const chain = {
            is(_c2: string, _v: null) {
              runUpdate((b) => b.carer_payout_hold_reason === null);
              return { then: (r: (v: unknown) => void) => r({ error: null }) };
            },
            eq(_c2: string, v2: string) {
              runUpdate((b) => b.carer_payout_hold_reason === v2);
              return { then: (r: (v: unknown) => void) => r({ error: null }) };
            },
            then(resolve: (v: unknown) => void) {
              runUpdate(() => true);
              resolve({ error: null });
            },
          };
          function runUpdate(guard: (b: BookingRow) => boolean) {
            const idx = state.bookings.findIndex((b) => b.id === id);
            if (idx >= 0 && guard(state.bookings[idx])) {
              state.bookings[idx] = {
                ...state.bookings[idx],
                ...(patch as Partial<BookingRow>),
              };
            }
          }
          return chain;
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function paymentsTable(state: FakeState): any {
  return {
    select() {
      return {
        eq(col: string, val: string) {
          return {
            maybeSingle: async () => {
              const row = state.payments.find(
                (p) =>
                  (p as unknown as Record<string, unknown>)[col] === val,
              );
              return { data: row ? { booking_id: row.booking_id } : null, error: null };
            },
          };
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ledgerTable(state: FakeState): any {
  return {
    upsert(row: Record<string, unknown>, opts?: Record<string, unknown>) {
      const conflict = (opts?.onConflict as string) ?? "";
      const keys = conflict.split(",").map((s) => s.trim());
      const rowRec = row as unknown as Record<string, unknown>;
      const exists = state.ledger.some((l) =>
        keys.every(
          (k) => (l as unknown as Record<string, unknown>)[k] === rowRec[k],
        ),
      );
      if (!exists) {
        state.ledger.push(row as unknown as LedgerRow);
      }
      // upsert().returns... we don't chain here — recordRefundEvent just awaits.
      return Promise.resolve({ error: null });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe event fixtures — minimal shape the handler reads.
// ─────────────────────────────────────────────────────────────────────────────

function disputeEvent(
  type: string,
  overrides: Partial<Stripe.Dispute> & { id?: string; charge?: string } = {},
  eventId = newId("evt_"),
): Stripe.Event {
  const dispute = {
    id: overrides.id ?? "dp_1",
    object: "dispute",
    amount: overrides.amount ?? 5000,
    charge: overrides.charge ?? "ch_1",
    currency: overrides.currency ?? "gbp",
    reason: overrides.reason ?? "fraudulent",
    status: overrides.status ?? "warning_needs_response",
    evidence_details: overrides.evidence_details ?? {
      due_by: Math.floor(Date.now() / 1000) + 7 * 86400,
    },
    payment_intent: overrides.payment_intent ?? null,
  } as unknown as Stripe.Dispute;
  return {
    id: eventId,
    object: "event",
    type,
    data: { object: dispute },
  } as unknown as Stripe.Event;
}

function baseState(): FakeState {
  return {
    cases: [],
    bookings: [
      { id: "bk_1", carer_payout_hold_reason: null },
      { id: "bk_2", carer_payout_hold_reason: "dbs_expired" },
    ],
    payments: [
      { booking_id: "bk_1", stripe_payment_intent_id: "pi_1", stripe_charge_id: "ch_1" },
      { booking_id: "bk_2", stripe_payment_intent_id: "pi_2", stripe_charge_id: "ch_2" },
    ],
    ledger: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("handleDisputeEvent — happy path", () => {
  it("opened → evidence_submitted → won releases the hold and re-includes the booking", async () => {
    const state = baseState();
    const admin = makeAdmin(state);

    // 1. charge.dispute.created
    const r1 = await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.created", {
        id: "dp_happy",
        charge: "ch_1",
        status: "warning_needs_response",
      }),
    );
    assert.equal(r1.ok, true);
    if (r1.ok && !("skippedReason" in r1)) {
      assert.equal(r1.inserted, true);
      assert.equal(r1.state, "opened");
      assert.equal(r1.holdChanged, true);
    }
    assert.equal(state.cases.length, 1);
    assert.equal(state.cases[0].state, "opened");
    assert.equal(
      state.bookings.find((b) => b.id === "bk_1")!.carer_payout_hold_reason,
      "dispute_open",
    );

    // 2. Admin marks evidence submitted (via markEvidenceSubmitted, not the webhook).
    const r2 = await markEvidenceSubmitted(admin, state.cases[0].id);
    assert.equal(r2.ok, true);
    assert.equal(state.cases[0].state, "evidence_submitted");

    // 3. charge.dispute.closed with status='won'
    const r3 = await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.closed", {
        id: "dp_happy",
        charge: "ch_1",
        status: "won",
      }),
    );
    assert.equal(r3.ok, true);
    if (r3.ok && !("skippedReason" in r3)) {
      assert.equal(r3.state, "won");
      assert.equal(r3.holdChanged, true);
      assert.equal(r3.ledgerWritten, false);
    }
    assert.equal(state.cases[0].state, "won");
    // Hold released — the booking is now re-includable by the payout cron.
    assert.equal(
      state.bookings.find((b) => b.id === "bk_1")!.carer_payout_hold_reason,
      null,
    );
    // No ledger row — a won dispute doesn't move money.
    assert.equal(state.ledger.length, 0);
  });
});

describe("handleDisputeEvent — lost path", () => {
  it("funds_withdrawn writes refund_ledger with event_type='dispute_lost' and preserves the hold", async () => {
    const state = baseState();
    const admin = makeAdmin(state);

    // Opened first.
    await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.created", {
        id: "dp_lost",
        charge: "ch_1",
        status: "warning_needs_response",
      }),
    );
    // funds_withdrawn arrives.
    const r = await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.funds_withdrawn", {
        id: "dp_lost",
        charge: "ch_1",
        amount: 5000,
        status: "lost",
      }),
    );
    assert.equal(r.ok, true);
    if (r.ok && !("skippedReason" in r)) {
      assert.equal(r.ledgerWritten, true);
    }
    // Ledger has one row of type dispute_lost with the negative amount.
    assert.equal(state.ledger.length, 1);
    assert.equal(state.ledger[0].event_type, "dispute_lost");
    assert.equal(state.ledger[0].stripe_refund_id, "dp_lost");
    assert.equal(state.ledger[0].amount_cents, -5000);
    // Hold remains — we deliberately don't clear on lost.
    assert.equal(
      state.bookings.find((b) => b.id === "bk_1")!.carer_payout_hold_reason,
      "dispute_open",
    );
  });
});

describe("handleDisputeEvent — warning_closed", () => {
  it("warning_closed: state moves, no ledger entry, no hold change from the close event alone", async () => {
    const state = baseState();
    // Pre-seed a hold to prove close doesn't touch it.
    state.bookings.find((b) => b.id === "bk_1")!.carer_payout_hold_reason =
      "dispute_open";
    // Also pre-seed the case in 'opened' so we're testing the transition.
    state.cases.push({
      id: "case_warn",
      booking_id: "bk_1",
      stripe_charge_id: "ch_1",
      stripe_dispute_id: "dp_warn",
      state: "opened",
      reason: null,
      amount_cents: 3000,
      currency: "gbp",
      evidence_due_at: null,
      opened_at: new Date().toISOString(),
      resolved_at: null,
      notes: null,
    });
    const admin = makeAdmin(state);

    const r = await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.closed", {
        id: "dp_warn",
        charge: "ch_1",
        status: "warning_closed",
      }),
    );
    assert.equal(r.ok, true);
    if (r.ok && !("skippedReason" in r)) {
      assert.equal(r.state, "warning_closed");
      assert.equal(r.ledgerWritten, false);
      // Hold not changed by the close event itself.
      assert.equal(r.holdChanged, false);
    }
    assert.equal(state.cases[0].state, "warning_closed");
    // No ledger written.
    assert.equal(state.ledger.length, 0);
    // Hold survives — a warning close doesn't imply money moved either way.
    assert.equal(
      state.bookings.find((b) => b.id === "bk_1")!.carer_payout_hold_reason,
      "dispute_open",
    );
  });
});

describe("handleDisputeEvent — duplicate delivery", () => {
  it("second delivery does not insert a second case row, does not double-release, no duplicate ledger entry", async () => {
    const state = baseState();
    const admin = makeAdmin(state);

    const evt = disputeEvent("charge.dispute.created", {
      id: "dp_dup",
      charge: "ch_1",
      status: "warning_needs_response",
    });
    const r1 = await handleDisputeEvent(admin, evt);
    assert.equal(r1.ok, true);
    assert.equal(state.cases.length, 1);
    const holdAfterFirst = state.bookings.find((b) => b.id === "bk_1")!
      .carer_payout_hold_reason;
    assert.equal(holdAfterFirst, "dispute_open");

    // Second delivery: same dispute id, same event type. Re-runs the handler
    // (as if Stripe replayed after a 5xx). Handler must be a no-op.
    const r2 = await handleDisputeEvent(admin, evt);
    assert.equal(r2.ok, true);
    if (r2.ok && !("skippedReason" in r2)) {
      // Not a fresh insert.
      assert.equal(r2.inserted, false);
      // Hold not "changed" again — it was already ours.
      assert.equal(r2.holdChanged, false);
    }
    assert.equal(state.cases.length, 1, "no second case row inserted");
    assert.equal(state.ledger.length, 0);

    // And a duplicate funds_withdrawn: only ONE ledger row.
    const fwEvt = disputeEvent("charge.dispute.funds_withdrawn", {
      id: "dp_dup",
      charge: "ch_1",
      amount: 5000,
      status: "lost",
    });
    await handleDisputeEvent(admin, fwEvt);
    await handleDisputeEvent(admin, fwEvt); // duplicate
    assert.equal(
      state.ledger.length,
      1,
      "duplicate funds_withdrawn collapses to one ledger row",
    );

    // And a duplicate closed=lost following funds_withdrawn: still ONE row
    // (same stripe_dispute_id + event_type='dispute_lost' unique key).
    const closedLost = disputeEvent("charge.dispute.closed", {
      id: "dp_dup",
      charge: "ch_1",
      amount: 5000,
      status: "lost",
    });
    await handleDisputeEvent(admin, closedLost);
    assert.equal(
      state.ledger.length,
      1,
      "closed=lost does not double-write the ledger",
    );
  });
});

describe("handleDisputeEvent — RLS documentation", () => {
  // The handler runs under the service-role admin client — RLS does not
  // apply. The RLS guarantee we care about here is a STATIC one: the
  // migration creates the table with RLS enabled and NO anon/authenticated
  // policies, so a carer's supabase client (row-level authenticated)
  // cannot SELECT stripe_dispute_cases at all. That is a schema-level
  // guarantee validated by the RLS test infra (supabase/migrations/
  // *.test.ts running the migration + querying under a JWT). We codify it
  // here as an assertion on the migration SQL so a future edit that
  // adds a permissive policy is caught in tests.
  it("migration enables RLS on stripe_dispute_cases with no permissive policies", async () => {
    const fs = await import("node:fs/promises");
    const sql = await fs.readFile(
      new URL(
        "../../../supabase/migrations/20260912133500_stripe_dispute_cases.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(
      sql,
      /alter table public\.stripe_dispute_cases enable row level security/i,
    );
    // No CREATE POLICY on this table anywhere in the migration.
    const policyRe = /create\s+policy[^;]+on\s+public\.stripe_dispute_cases/gi;
    assert.equal(
      policyRe.test(sql),
      false,
      "no policies should be granted — service-role only",
    );
  });
});

describe("handleDisputeEvent — deploy-safe fallback", () => {
  it("returns {ok:true, skippedReason:'schema_not_ready'} when stripe_dispute_cases is missing", async () => {
    const state = baseState();
    state.simulate = { kind: "cases_missing" };
    const admin = makeAdmin(state);
    const r = await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.created", {
        id: "dp_early",
        charge: "ch_1",
        status: "warning_needs_response",
      }),
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r, { ok: true, skippedReason: "schema_not_ready" });
    // Handler did not touch bookings or ledger.
    assert.equal(state.ledger.length, 0);
    assert.equal(
      state.bookings.find((b) => b.id === "bk_1")!.carer_payout_hold_reason,
      null,
    );
  });
});

describe("handleDisputeEvent — won after other hold reason (dbs_expired)", () => {
  it("preserves dbs_expired hold when dispute is won", async () => {
    const state = baseState();
    // bk_2 starts held for dbs_expired.
    assert.equal(
      state.bookings.find((b) => b.id === "bk_2")!.carer_payout_hold_reason,
      "dbs_expired",
    );
    const admin = makeAdmin(state);

    // Dispute opens on bk_2. setDisputeOpenHold refuses to overwrite
    // a different reason, so the hold stays 'dbs_expired'. The case
    // still opens with state='opened' because the case model is
    // independent of the hold-reason column.
    await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.created", {
        id: "dp_dbs",
        charge: "ch_2",
        status: "warning_needs_response",
      }),
    );
    assert.equal(
      state.bookings.find((b) => b.id === "bk_2")!.carer_payout_hold_reason,
      "dbs_expired",
      "dbs_expired hold preserved when dispute opens on top of it",
    );

    // Dispute won. clearDisputeOpenHold refuses to clear a non-
    // 'dispute_open' reason, so 'dbs_expired' stays.
    await handleDisputeEvent(
      admin,
      disputeEvent("charge.dispute.closed", {
        id: "dp_dbs",
        charge: "ch_2",
        status: "won",
      }),
    );
    assert.equal(
      state.bookings.find((b) => b.id === "bk_2")!.carer_payout_hold_reason,
      "dbs_expired",
      "dbs_expired hold preserved even when the dispute is won",
    );
  });
});

describe("markEvidenceSubmitted", () => {
  it("moves opened → evidence_submitted", async () => {
    const state = baseState();
    state.cases.push({
      id: "case_ev",
      booking_id: "bk_1",
      stripe_charge_id: "ch_1",
      stripe_dispute_id: "dp_ev",
      state: "opened",
      reason: null,
      amount_cents: 5000,
      currency: "gbp",
      evidence_due_at: null,
      opened_at: new Date().toISOString(),
      resolved_at: null,
      notes: null,
    });
    const admin = makeAdmin(state);
    const r = await markEvidenceSubmitted(admin, "case_ev");
    assert.equal(r.ok, true);
    assert.equal(state.cases[0].state, "evidence_submitted");
  });

  it("rejects terminal states with reason='already_terminal'", async () => {
    const state = baseState();
    state.cases.push({
      id: "case_won",
      booking_id: "bk_1",
      stripe_charge_id: "ch_1",
      stripe_dispute_id: "dp_won",
      state: "won",
      reason: null,
      amount_cents: 5000,
      currency: "gbp",
      evidence_due_at: null,
      opened_at: new Date().toISOString(),
      resolved_at: null,
      notes: null,
    });
    const admin = makeAdmin(state);
    const r = await markEvidenceSubmitted(admin, "case_won");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "already_terminal");
    }
  });
});
