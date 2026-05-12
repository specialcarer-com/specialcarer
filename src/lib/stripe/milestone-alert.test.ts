/**
 * Unit tests for the one-shot Stripe milestone alert.
 *
 * Run with:  npm test
 *   (which expands to `tsx --test src/lib/stripe/milestone-alert.test.ts`)
 *
 * Uses dependency injection on the core helper so we don't need Supabase,
 * SMTP, or Resend running locally — both the admin client and the email
 * sender are stubbed. We import from `./milestone-alert-core` (not the
 * `server-only`-guarded wrapper) so the file runs cleanly under `tsx`.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { SendEmailInput, SendEmailResult } from "@/lib/email/smtp";
import {
  alertOnFirstLivePaymentSucceeded,
  ALERT_RECIPIENTS,
  MILESTONE_FIRST_LIVE_PI_SUCCEEDED,
} from "./milestone-alert-core";

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Fake Supabase admin client that only implements the subset
 * platform_milestones uses: `.from('platform_milestones').select().eq().maybeSingle()`
 * + `.from('platform_milestones').insert()`.
 *
 * State lives on the closure so it survives between calls in a single test.
 */
function makeFakeAdmin() {
  const rows = new Map<string, { key: string; payload: unknown }>();

  const builder = (action: "select" | "insert") => {
    if (action === "insert") {
      return {
        insert: (row: { key: string; payload: unknown }) => {
          if (rows.has(row.key)) {
            // Simulate Postgres unique-violation (23505).
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key" },
            });
          }
          rows.set(row.key, row);
          return Promise.resolve({ data: row, error: null });
        },
      };
    }
    return {
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: rows.has(val) ? rows.get(val) : null,
              error: null,
            }),
        }),
      }),
    };
  };

  return {
    from(table: string) {
      if (table !== "platform_milestones") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: builder("select").select,
        insert: builder("insert").insert,
      };
    },
    /** Test helper — peek at what's stored. */
    __rows: rows,
  };
}

function makeSendSpy() {
  const calls: SendEmailInput[] = [];
  const send = async (input: SendEmailInput): Promise<SendEmailResult> => {
    calls.push(input);
    return { ok: true, messageId: `msg_${calls.length}` };
  };
  return { send, calls };
}

function makeLoggerSpy() {
  const infos: unknown[][] = [];
  const errors: unknown[][] = [];
  return {
    logger: {
      info: (...args: unknown[]) => infos.push(args),
      error: (...args: unknown[]) => errors.push(args),
    },
    infos,
    errors,
  };
}

function piEvent(opts: {
  id?: string;
  pi_id?: string;
  livemode?: boolean;
  type?: string;
  amount?: number;
  currency?: string;
}): Stripe.Event {
  const pi: Partial<Stripe.PaymentIntent> = {
    id: opts.pi_id ?? "pi_live_test_123",
    object: "payment_intent",
    amount: opts.amount ?? 5000,
    amount_received: opts.amount ?? 5000,
    currency: opts.currency ?? "gbp",
    customer: "cus_test_abc",
    created: 1715600000,
    status: "succeeded",
  };
  return {
    id: opts.id ?? "evt_live_test_1",
    object: "event",
    api_version: "2026-04-22",
    created: 1715600000,
    livemode: opts.livemode ?? true,
    type: opts.type ?? "payment_intent.succeeded",
    data: { object: pi as Stripe.PaymentIntent },
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as unknown as Stripe.Event;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("alertOnFirstLivePaymentSucceeded", () => {
  let admin: ReturnType<typeof makeFakeAdmin>;
  let spy: ReturnType<typeof makeSendSpy>;
  let log: ReturnType<typeof makeLoggerSpy>;

  beforeEach(() => {
    admin = makeFakeAdmin();
    spy = makeSendSpy();
    log = makeLoggerSpy();
  });

  it("inserts milestone + sends one email per recipient on first livemode PI", async () => {
    const sent = await alertOnFirstLivePaymentSucceeded(piEvent({}), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      send: spy.send,
      logger: log.logger,
    });
    assert.equal(sent, true);
    // Milestone row inserted with the singleton key.
    assert.equal(admin.__rows.has(MILESTONE_FIRST_LIVE_PI_SUCCEEDED), true);
    // One email per recipient.
    assert.equal(spy.calls.length, ALERT_RECIPIENTS.length);
    // Each recipient was actually addressed.
    const tos = new Set(spy.calls.map((c) => c.to));
    for (const r of ALERT_RECIPIENTS) assert.ok(tos.has(r), `missing ${r}`);
    // Body carries the PI id and dashboard link.
    for (const c of spy.calls) {
      assert.match(c.subject, /First live Stripe payment processed/);
      assert.match(c.text, /pi_live_test_123/);
      assert.match(
        c.html,
        /dashboard\.stripe\.com\/payments\/pi_live_test_123/,
      );
    }
  });

  it("does NOT send on a second livemode PI (one-shot DB guard)", async () => {
    // First call — fires.
    await alertOnFirstLivePaymentSucceeded(
      piEvent({ id: "evt_live_test_1", pi_id: "pi_live_first" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { admin: admin as any, send: spy.send, logger: log.logger },
    );
    const firstCallCount = spy.calls.length;
    assert.equal(firstCallCount, ALERT_RECIPIENTS.length);

    // Second call — different PI, same admin (shared milestone row) — should skip.
    const sent = await alertOnFirstLivePaymentSucceeded(
      piEvent({ id: "evt_live_test_2", pi_id: "pi_live_second" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { admin: admin as any, send: spy.send, logger: log.logger },
    );
    assert.equal(sent, false);
    assert.equal(
      spy.calls.length,
      firstCallCount,
      "send should not have been called again",
    );
  });

  it("skips test-mode events (livemode=false)", async () => {
    const sent = await alertOnFirstLivePaymentSucceeded(
      piEvent({ livemode: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { admin: admin as any, send: spy.send, logger: log.logger },
    );
    assert.equal(sent, false);
    assert.equal(spy.calls.length, 0);
    // No DB row written either.
    assert.equal(admin.__rows.size, 0);
  });

  it("skips event types other than payment_intent.succeeded", async () => {
    const sent = await alertOnFirstLivePaymentSucceeded(
      piEvent({ type: "payment_intent.amount_capturable_updated" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { admin: admin as any, send: spy.send, logger: log.logger },
    );
    assert.equal(sent, false);
    assert.equal(spy.calls.length, 0);
    assert.equal(admin.__rows.size, 0);
  });

  it("never throws when send fails", async () => {
    const blowUp = async (): Promise<SendEmailResult> => {
      throw new Error("smtp on fire");
    };
    // Should return false (no email sent) but NOT throw.
    const sent = await alertOnFirstLivePaymentSucceeded(piEvent({}), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      send: blowUp,
      logger: log.logger,
    });
    assert.equal(sent, false);
    // Milestone is still claimed — by design, we don't retry once claimed.
    assert.equal(admin.__rows.has(MILESTONE_FIRST_LIVE_PI_SUCCEEDED), true);
    // Errors were logged.
    assert.ok(log.errors.length > 0, "expected error log entries");
  });

  it("never throws when DB claim fails", async () => {
    const brokenAdmin = {
      from() {
        throw new Error("db on fire");
      },
    };
    const sent = await alertOnFirstLivePaymentSucceeded(piEvent({}), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: brokenAdmin as any,
      send: spy.send,
      logger: log.logger,
    });
    assert.equal(sent, false);
    assert.equal(spy.calls.length, 0);
    assert.ok(log.errors.length > 0);
  });
});
