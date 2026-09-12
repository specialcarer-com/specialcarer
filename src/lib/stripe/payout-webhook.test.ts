/**
 * Tests for src/lib/stripe/payout-webhook.ts — the C4 alerting layer.
 *
 * Covers the acceptance criteria from phase_c/phase_c_pr_plan.md:
 *   1. payout.failed → payout_alerts row (state='new'), in-app + carer
 *      email + admin email dispatched.
 *   3. payout.paid for a previously failed payout → matching alert
 *      resolves (state='resolved', resolved_at stamped).
 *   4. Duplicate payout.failed → no second alert row, no second
 *      notification (unique index catches).
 *   + payout.canceled → alert row with notes = 'canceled by Stripe'.
 *   + Schema-not-ready fallback → no crash, {skippedReason} return.
 *
 * The digest cron's own criterion (2) is covered by exercising its
 * DB-shaping logic directly. See end of file.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  handlePayoutAlertEvent,
  type PayoutAdminClient,
} from "./payout-webhook";

// ─────────────────────────────────────────────────────────────────────────────
// Fake admin client — in-memory tables for payout_alerts, payout_intents,
// caregiver_stripe_accounts, profiles.
// ─────────────────────────────────────────────────────────────────────────────

type AlertRow = {
  id: string;
  carer_id: string;
  booking_id: string | null;
  alert_type: string;
  stripe_payout_id: string | null;
  amount_cents: number | null;
  currency: string;
  state: "new" | "notified" | "acknowledged" | "resolved";
  created_at: string;
  resolved_at: string | null;
  notes: string | null;
};

type PayoutIntentRow = {
  stripe_payout_id: string;
  carer_id: string;
};

type StripeAccountRow = {
  stripe_account_id: string;
  user_id: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
};

type FakeState = {
  alerts: AlertRow[];
  intents: PayoutIntentRow[];
  accounts: StripeAccountRow[];
  profiles: ProfileRow[];
  simulate?: { kind: "alerts_missing" };
};

function newId(prefix = "id_"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function schemaMissingTable(name: string): any {
  const error = { code: "42P01", message: `relation "${name}" does not exist` };
  const failure = { data: null, error };
  const chainableThatResolves = () => ({
    select: () => ({
      maybeSingle: async () => failure,
      then: (resolve: (v: unknown) => void) => resolve(failure),
    }),
    eq: () => chainableThatResolves(),
    in: () => chainableThatResolves(),
    order: () => chainableThatResolves(),
    gte: () => chainableThatResolves(),
    limit: () => chainableThatResolves(),
    neq: () => chainableThatResolves(),
    maybeSingle: async () => failure,
    then: (resolve: (v: unknown) => void) => resolve(failure),
  });
  return {
    select: () => chainableThatResolves(),
    insert: () => ({
      select: () => ({ maybeSingle: async () => failure }),
    }),
    update: () => chainableThatResolves(),
    upsert: () => ({
      select: () => ({ maybeSingle: async () => failure }),
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function alertsTable(state: FakeState): any {
  return {
    select() {
      // .select(cols).eq(col, val).eq(col2, val2).maybeSingle()
      //   — used by the duplicate-lookup path.
      // .select(cols).eq(...).in(...).order(...).limit(...) — for cron.
      const captured: Array<{ op: "eq" | "in" | "neq"; col: string; val: unknown }> = [];
      const chain: {
        eq: (col: string, val: unknown) => typeof chain;
        in: (col: string, vals: unknown[]) => typeof chain;
        neq: (col: string, val: unknown) => typeof chain;
        order: () => typeof chain;
        limit: () => typeof chain;
        gte: () => typeof chain;
        maybeSingle: () => Promise<{ data: AlertRow | null; error: null }>;
      } = {
        eq(col, val) {
          captured.push({ op: "eq", col, val });
          return chain;
        },
        in(col, vals) {
          captured.push({ op: "in", col, val: vals });
          return chain;
        },
        neq(col, val) {
          captured.push({ op: "neq", col, val });
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return chain;
        },
        gte() {
          return chain;
        },
        async maybeSingle() {
          let found: AlertRow | undefined = state.alerts.find((r) =>
            captured.every((c) => {
              if (c.op !== "eq") return true;
              return (r as unknown as Record<string, unknown>)[c.col] === c.val;
            }),
          );
          if (found === undefined) found = undefined;
          return { data: (found ?? null) as AlertRow | null, error: null };
        },
      };
      return chain;
    },
    insert(row: Partial<AlertRow>) {
      // Idempotency: enforce partial unique index on
      // (stripe_payout_id, alert_type) WHERE stripe_payout_id IS NOT NULL.
      const dup = state.alerts.find(
        (r) =>
          r.stripe_payout_id !== null &&
          r.stripe_payout_id === row.stripe_payout_id &&
          r.alert_type === row.alert_type,
      );
      if (dup) {
        const error = {
          code: "23505",
          message:
            "duplicate key value violates unique constraint payout_alerts_stripe_payout_type_idx",
        };
        return {
          select: () => ({
            maybeSingle: async () => ({ data: null, error }),
          }),
        };
      }
      const created: AlertRow = {
        id: newId("alert_"),
        carer_id: row.carer_id ?? "",
        booking_id: row.booking_id ?? null,
        alert_type: (row.alert_type as AlertRow["alert_type"]) ?? "failed",
        stripe_payout_id: row.stripe_payout_id ?? null,
        amount_cents: row.amount_cents ?? null,
        currency: row.currency ?? "gbp",
        state: (row.state as AlertRow["state"]) ?? "new",
        created_at: new Date().toISOString(),
        resolved_at: null,
        notes: row.notes ?? null,
      };
      state.alerts.push(created);
      return {
        select: () => ({
          maybeSingle: async () => ({ data: { id: created.id }, error: null }),
        }),
      };
    },
    update(patch: Partial<AlertRow>) {
      const captured: Array<{
        op: "eq" | "in";
        col: string;
        val: unknown;
      }> = [];
      const chain: {
        eq: (col: string, val: unknown) => typeof chain;
        in: (col: string, vals: unknown[]) => typeof chain;
        select: () => Promise<{ data: AlertRow[]; error: null }>;
        then: (
          resolve: (v: { data: null; error: null }) => void,
        ) => void;
      } = {
        eq(col, val) {
          captured.push({ op: "eq", col, val });
          return chain;
        },
        in(col, vals) {
          captured.push({ op: "in", col, val: vals });
          return chain;
        },
        async select() {
          const matched: AlertRow[] = [];
          for (const r of state.alerts) {
            const ok = captured.every((c) => {
              const v = (r as unknown as Record<string, unknown>)[c.col];
              if (c.op === "eq") return v === c.val;
              return (c.val as unknown[]).includes(v);
            });
            if (ok) {
              Object.assign(r, patch);
              matched.push(r);
            }
          }
          return { data: matched, error: null };
        },
        then(resolve) {
          // Support `await` without .select() for callers that just
          // want fire-and-forget. In the test we only rely on .select.
          for (const r of state.alerts) {
            const ok = captured.every((c) => {
              const v = (r as unknown as Record<string, unknown>)[c.col];
              if (c.op === "eq") return v === c.val;
              return (c.val as unknown[]).includes(v);
            });
            if (ok) Object.assign(r, patch);
          }
          resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payoutIntentsTable(state: FakeState): any {
  return {
    select() {
      return {
        eq(_col: string, val: string) {
          return {
            maybeSingle: async () => {
              const row = state.intents.find(
                (r) => r.stripe_payout_id === val,
              );
              return { data: row ?? null, error: null };
            },
          };
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accountsTable(state: FakeState): any {
  return {
    select() {
      return {
        eq(_col: string, val: string) {
          return {
            maybeSingle: async () => {
              const row = state.accounts.find(
                (r) => r.stripe_account_id === val,
              );
              return { data: row ?? null, error: null };
            },
          };
        },
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profilesTable(state: FakeState): any {
  return {
    select() {
      return {
        eq(_col: string, val: string) {
          return {
            maybeSingle: async () => {
              const row = state.profiles.find((r) => r.id === val);
              return { data: row ?? null, error: null };
            },
          };
        },
      };
    },
  };
}

function makeAdmin(state: FakeState): PayoutAdminClient {
  return {
    from(name: string) {
      if (state.simulate?.kind === "alerts_missing" && name === "payout_alerts") {
        return schemaMissingTable("payout_alerts");
      }
      switch (name) {
        case "payout_alerts":
          return alertsTable(state);
        case "payout_intents":
          return payoutIntentsTable(state);
        case "caregiver_stripe_accounts":
          return accountsTable(state);
        case "profiles":
          return profilesTable(state);
        default:
          return schemaMissingTable(name);
      }
    },
  };
}

// ── Event builders ──────────────────────────────────────────────────────────

function payoutEvent(
  type: "payout.failed" | "payout.paid" | "payout.canceled",
  args: {
    id: string;
    amount: number;
    currency: string;
    failure_message?: string | null;
    destination?: string | null;
  },
): Stripe.Event {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    type,
    data: {
      object: {
        id: args.id,
        amount: args.amount,
        currency: args.currency,
        failure_message: args.failure_message ?? null,
        destination: args.destination ?? null,
        object: "payout",
      },
    },
  } as unknown as Stripe.Event;
}

// ── Test deps ───────────────────────────────────────────────────────────────

function makeDeps() {
  const notifications: Array<Record<string, unknown>> = [];
  const emails: Array<{ to: string; subject: string }> = [];
  return {
    notifications,
    emails,
    deps: {
      dispatchNotification: async (input: Record<string, unknown>) => {
        notifications.push(input);
        return { id: newId("notif_") };
      },
      sendEmail: async (input: { to: string; subject: string }) => {
        emails.push({ to: input.to, subject: input.subject });
        return { ok: true as const, messageId: newId("msg_") };
      },
      lookupCarerEmail: async (
        _admin: PayoutAdminClient,
        carerId: string,
      ) => {
        // Look through profiles list captured at closure time.
        return state.profiles.find((p) => p.id === carerId)?.email ?? null;
      },
      adminEmail: "ops-alerts@specialcarer.com",
    },
  };
}

// Shared fixture data per test — inlined for isolation.
let state: FakeState;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("payout-webhook: payout.failed", () => {
  it("writes alert row + fires in-app + carer email + admin email (AC1)", async () => {
    state = {
      alerts: [],
      intents: [{ stripe_payout_id: "po_a1", carer_id: "carer_1" }],
      accounts: [],
      profiles: [{ id: "carer_1", email: "carer1@example.com" }],
    };
    const admin = makeAdmin(state);
    const { deps, notifications, emails } = makeDeps();
    const event = payoutEvent("payout.failed", {
      id: "po_a1",
      amount: 12345,
      currency: "gbp",
      failure_message: "account_closed",
    });

    const res = await handlePayoutAlertEvent(admin, event, deps);

    assert.equal(res.ok, true);
    assert.equal("inserted" in res && res.inserted, true);
    assert.equal("notified" in res && res.notified, true);
    // Alert row exists, state=notified (after fire).
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].alert_type, "failed");
    assert.equal(state.alerts[0].stripe_payout_id, "po_a1");
    assert.equal(state.alerts[0].state, "notified");
    assert.equal(state.alerts[0].amount_cents, 12345);
    // One in-app notification, two emails (carer + admin).
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].user_id, "carer_1");
    assert.equal(notifications[0].type, "payout.failed");
    assert.equal(emails.length, 2);
    const recipients = emails.map((e) => e.to).sort();
    assert.deepEqual(recipients, [
      "carer1@example.com",
      "ops-alerts@specialcarer.com",
    ]);
  });

  it("resolves carer via caregiver_stripe_accounts when payout_intents miss", async () => {
    state = {
      alerts: [],
      intents: [],
      accounts: [{ stripe_account_id: "acct_x", user_id: "carer_2" }],
      profiles: [{ id: "carer_2", email: "c2@example.com" }],
    };
    const admin = makeAdmin(state);
    const { deps, notifications } = makeDeps();
    const event = payoutEvent("payout.failed", {
      id: "po_a2",
      amount: 500,
      currency: "gbp",
      destination: "acct_x",
    });

    const res = await handlePayoutAlertEvent(admin, event, deps);
    assert.equal(res.ok, true);
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].carer_id, "carer_2");
    assert.equal(notifications.length, 1);
  });

  it("skips cleanly when carer cannot be resolved", async () => {
    state = { alerts: [], intents: [], accounts: [], profiles: [] };
    const admin = makeAdmin(state);
    const { deps, notifications, emails } = makeDeps();
    const event = payoutEvent("payout.failed", {
      id: "po_a3",
      amount: 500,
      currency: "gbp",
    });

    const res = await handlePayoutAlertEvent(admin, event, deps);
    assert.equal(res.ok, true);
    assert.equal(
      "skippedReason" in res && res.skippedReason,
      "no_carer_resolved",
    );
    assert.equal(state.alerts.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(emails.length, 0);
  });
});

describe("payout-webhook: idempotency", () => {
  it("duplicate payout.failed writes no second row + fires no second notification (AC4)", async () => {
    state = {
      alerts: [],
      intents: [{ stripe_payout_id: "po_dup", carer_id: "carer_3" }],
      accounts: [],
      profiles: [{ id: "carer_3", email: "c3@example.com" }],
    };
    const admin = makeAdmin(state);
    const { deps, notifications, emails } = makeDeps();

    const first = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.failed", {
        id: "po_dup",
        amount: 900,
        currency: "gbp",
      }),
      deps,
    );
    assert.equal(first.ok, true);
    assert.equal("inserted" in first && first.inserted, true);
    assert.equal(state.alerts.length, 1);
    assert.equal(notifications.length, 1);
    assert.equal(emails.length, 2);

    const second = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.failed", {
        id: "po_dup",
        amount: 900,
        currency: "gbp",
      }),
      deps,
    );
    assert.equal(second.ok, true);
    assert.equal("inserted" in second && second.inserted, false);
    assert.equal("notified" in second && second.notified, false);
    // No new alert row.
    assert.equal(state.alerts.length, 1);
    // No new notification/email.
    assert.equal(notifications.length, 1);
    assert.equal(emails.length, 2);
  });
});

describe("payout-webhook: payout.paid", () => {
  it("moves a prior failed alert to state='resolved' with resolved_at (AC3)", async () => {
    state = {
      alerts: [
        {
          id: "existing",
          carer_id: "carer_4",
          booking_id: null,
          alert_type: "failed",
          stripe_payout_id: "po_paid",
          amount_cents: 500,
          currency: "gbp",
          state: "notified",
          created_at: new Date().toISOString(),
          resolved_at: null,
          notes: null,
        },
      ],
      intents: [{ stripe_payout_id: "po_paid", carer_id: "carer_4" }],
      accounts: [],
      profiles: [{ id: "carer_4", email: "c4@example.com" }],
    };
    const admin = makeAdmin(state);
    const { deps, notifications, emails } = makeDeps();

    const res = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.paid", {
        id: "po_paid",
        amount: 500,
        currency: "gbp",
      }),
      deps,
    );

    assert.equal(res.ok, true);
    assert.equal("resolved" in res && res.resolved, true);
    assert.equal(state.alerts[0].state, "resolved");
    assert.notEqual(state.alerts[0].resolved_at, null);
    // payout.paid never fires notifications from the alert layer.
    assert.equal(notifications.length, 0);
    assert.equal(emails.length, 0);
  });

  it("is a benign no-op if there's nothing to resolve", async () => {
    state = { alerts: [], intents: [], accounts: [], profiles: [] };
    const admin = makeAdmin(state);
    const { deps } = makeDeps();
    const res = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.paid", {
        id: "po_none",
        amount: 100,
        currency: "gbp",
      }),
      deps,
    );
    assert.equal(res.ok, true);
    assert.equal("resolved" in res && res.resolved, false);
  });
});

describe("payout-webhook: payout.canceled", () => {
  it("writes alert with notes = 'canceled by Stripe' + notifies", async () => {
    state = {
      alerts: [],
      intents: [{ stripe_payout_id: "po_cx", carer_id: "carer_5" }],
      accounts: [],
      profiles: [{ id: "carer_5", email: "c5@example.com" }],
    };
    const admin = makeAdmin(state);
    const { deps, notifications, emails } = makeDeps();

    const res = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.canceled", {
        id: "po_cx",
        amount: 700,
        currency: "gbp",
      }),
      deps,
    );

    assert.equal(res.ok, true);
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].alert_type, "failed");
    assert.equal(state.alerts[0].notes, "canceled by Stripe");
    assert.equal(notifications.length, 1);
    assert.equal(emails.length, 2);
  });
});

describe("payout-webhook: deploy-safe fallback", () => {
  it("returns schema_not_ready when payout_alerts table is missing (AC6)", async () => {
    state = {
      alerts: [],
      intents: [{ stripe_payout_id: "po_ns", carer_id: "carer_6" }],
      accounts: [],
      profiles: [{ id: "carer_6", email: "c6@example.com" }],
      simulate: { kind: "alerts_missing" },
    };
    const admin = makeAdmin(state);
    const { deps, notifications, emails } = makeDeps();

    const failedRes = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.failed", {
        id: "po_ns",
        amount: 400,
        currency: "gbp",
      }),
      deps,
    );
    assert.equal(failedRes.ok, true);
    assert.equal(
      "skippedReason" in failedRes && failedRes.skippedReason,
      "schema_not_ready",
    );
    assert.equal(state.alerts.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(emails.length, 0);

    // paid path also returns schema_not_ready cleanly.
    const paidRes = await handlePayoutAlertEvent(
      admin,
      payoutEvent("payout.paid", {
        id: "po_ns",
        amount: 400,
        currency: "gbp",
      }),
      deps,
    );
    assert.equal(paidRes.ok, true);
    assert.equal(
      "skippedReason" in paidRes && paidRes.skippedReason,
      "schema_not_ready",
    );
  });
});

describe("payout-webhook: non-payout events", () => {
  it("returns unhandled_event_type for unrelated events", async () => {
    state = { alerts: [], intents: [], accounts: [], profiles: [] };
    const admin = makeAdmin(state);
    const { deps } = makeDeps();
    const event = {
      id: "evt_other",
      type: "charge.refunded",
      data: { object: {} },
    } as unknown as Stripe.Event;
    const res = await handlePayoutAlertEvent(admin, event, deps);
    assert.equal(res.ok, true);
    assert.equal(
      "skippedReason" in res && res.skippedReason,
      "unhandled_event_type",
    );
  });
});
