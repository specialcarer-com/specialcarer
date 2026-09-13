/**
 * D5 — overdue-invoice booking block tests.
 *
 * Models three surfaces the D5 migration + route ships:
 *
 *   1. The overdue predicate itself
 *      status IN ('open','uncollectible')
 *        AND due_date IS NOT NULL
 *        AND due_date < CURRENT_DATE
 *        AND amount_paid_cents < amount_due_cents.
 *
 *   2. The has_overdue_invoices(uuid) helper — modelled as an
 *      in-memory scan over the fixture invoices, then a route-layer
 *      wrapper (checkOverdueInvoices) that maps error codes.
 *
 *   3. The route+RPC error surface — the ORG_HAS_OVERDUE_INVOICES
 *      prefix is raised by both the RPC (inside a SECURITY DEFINER
 *      function) and, in a race window, mapped from any bookings
 *      INSERT that happens to hit the trigger. isOverdueInvoiceError
 *      pattern-matches on the sentinel prefix.
 *
 * Follows the D3/D4 test style: pure in-memory mocks that emulate
 * the SQL predicate + supabase-js return shapes. Real integration
 * lives in the follow-up integration harness (see the D3 concurrency
 * test file for the pattern).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isOverdueInvoiceError,
  checkOverdueInvoices,
} from "@/lib/org/overdue-block";

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
type Invoice = {
  id: string;
  organization_id: string;
  status: InvoiceStatus;
  due_date: string | null; // ISO date
  amount_due_cents: number;
  amount_paid_cents: number;
};

// Predicate mirrors the migration file exactly. Kept as a single
// expression so a subtle change to the SQL is immediately reflected
// as a test edit.
function hasOverdue(invoices: Invoice[], orgId: string, today: Date): boolean {
  const todayDate = today.toISOString().slice(0, 10);
  return invoices.some(
    (i) =>
      i.organization_id === orgId &&
      (i.status === "open" || i.status === "uncollectible") &&
      i.due_date !== null &&
      i.due_date < todayDate &&
      i.amount_paid_cents < i.amount_due_cents,
  );
}

// Minimal supabase-js RPC shim used by checkOverdueInvoices.
function makeAdminStub(rpcImpl: (name: string, args: unknown) => {
  data: unknown;
  error: { code?: string; message?: string } | null;
}) {
  return {
    rpc: (name: string, args: unknown) => Promise.resolve(rpcImpl(name, args)),
  } as unknown as Parameters<typeof checkOverdueInvoices>[0];
}

// ---------------------------------------------------------------------------
// 1. Overdue predicate — status filter
// ---------------------------------------------------------------------------

describe("overdue predicate — status filter", () => {
  const today = new Date("2026-09-13T12:00:00Z");
  const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("matches status='open' with past due_date and unpaid balance", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: "2026-09-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), true);
  });

  it("matches status='uncollectible' with past due_date and unpaid balance", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "uncollectible",
        due_date: "2026-08-01",
        amount_due_cents: 500_00,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), true);
  });

  it("does NOT match status='draft'", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "draft",
        due_date: "2026-09-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });

  it("does NOT match status='paid' even if due_date is past", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "paid",
        due_date: "2026-08-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 10_000,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });

  it("does NOT match status='void'", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "void",
        due_date: "2026-08-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });
});

// ---------------------------------------------------------------------------
// 2. Overdue predicate — date + balance edges
// ---------------------------------------------------------------------------

describe("overdue predicate — date + balance edges", () => {
  const today = new Date("2026-09-13T12:00:00Z");
  const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("does NOT match if due_date is NULL (invoice with no due date)", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: null,
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });

  it("does NOT match if due_date is today (must be strictly less than)", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: "2026-09-13",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });

  it("does NOT match if due_date is in the future", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: "2026-09-14",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });

  it("does NOT match a partially-paid invoice where paid == due", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: "2026-09-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 10_000,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), false);
  });

  it("matches a partially-paid invoice where paid < due", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: "2026-09-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 9_999,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), true);
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-org isolation
// ---------------------------------------------------------------------------

describe("overdue predicate — cross-org isolation", () => {
  const today = new Date("2026-09-13T12:00:00Z");
  const orgA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const orgB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  it("org A's overdue invoice does NOT block org B", () => {
    const invoices: Invoice[] = [
      {
        id: "inv1",
        organization_id: orgA,
        status: "open",
        due_date: "2026-09-01",
        amount_due_cents: 10_000,
        amount_paid_cents: 0,
      },
    ];
    assert.equal(hasOverdue(invoices, orgA, today), true);
    assert.equal(hasOverdue(invoices, orgB, today), false);
  });

  it("empty invoice set → no overdue for any org", () => {
    assert.equal(hasOverdue([], orgA, today), false);
    assert.equal(hasOverdue([], orgB, today), false);
  });
});

// ---------------------------------------------------------------------------
// 4. checkOverdueInvoices route wrapper — success + fallback
// ---------------------------------------------------------------------------

describe("checkOverdueInvoices — route wrapper", () => {
  const orgId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("returns { blocked: true } when RPC returns true", async () => {
    const admin = makeAdminStub((name, args) => {
      assert.equal(name, "has_overdue_invoices");
      assert.deepEqual(args, { p_organization_id: orgId });
      return { data: true, error: null };
    });
    const result = await checkOverdueInvoices(admin, orgId);
    assert.deepEqual(result, { blocked: true });
  });

  it("returns { blocked: false } when RPC returns false", async () => {
    const admin = makeAdminStub(() => ({ data: false, error: null }));
    const result = await checkOverdueInvoices(admin, orgId);
    assert.equal(result.blocked, false);
  });

  it("falls back to { blocked: false, reason: 'schema_not_ready' } when RPC missing (42883)", async () => {
    const admin = makeAdminStub(() => ({
      data: null,
      error: { code: "42883", message: "function has_overdue_invoices(uuid) does not exist" },
    }));
    const result = await checkOverdueInvoices(admin, orgId);
    assert.deepEqual(result, { blocked: false, reason: "schema_not_ready" });
  });

  it("falls back to { blocked: false, reason: 'schema_not_ready' } when org_invoices table missing (42P01)", async () => {
    const admin = makeAdminStub(() => ({
      data: null,
      error: { code: "42P01", message: 'relation "org_invoices" does not exist' },
    }));
    const result = await checkOverdueInvoices(admin, orgId);
    assert.deepEqual(result, { blocked: false, reason: "schema_not_ready" });
  });

  it("returns query_error reason on unexpected error", async () => {
    const admin = makeAdminStub(() => ({
      data: null,
      error: { code: "XX000", message: "internal error" },
    }));
    const result = await checkOverdueInvoices(admin, orgId);
    assert.deepEqual(result, { blocked: false, reason: "query_error" });
  });
});

// ---------------------------------------------------------------------------
// 5. isOverdueInvoiceError — RAISE sentinel pattern match
// ---------------------------------------------------------------------------

describe("isOverdueInvoiceError — RAISE sentinel", () => {
  it("matches the full sentinel with prefix + colon", () => {
    assert.equal(
      isOverdueInvoiceError({
        code: "P0001",
        message: "ORG_HAS_OVERDUE_INVOICES: cannot create bookings while organisation has overdue invoices",
      }),
      true,
    );
  });

  it("matches even when the message is wrapped by supabase-js (contains anywhere)", () => {
    // supabase-js sometimes wraps as "new row for relation ...: ORG_HAS_OVERDUE_INVOICES: ..."
    assert.equal(
      isOverdueInvoiceError({
        code: "P0001",
        message: "wrapper prefix: ORG_HAS_OVERDUE_INVOICES: details",
      }),
      true,
    );
  });

  it("does NOT match a generic P0001 raise_exception", () => {
    assert.equal(
      isOverdueInvoiceError({
        code: "P0001",
        message: "booker_member_id X is not a member of organization Y",
      }),
      false,
    );
  });

  it("does NOT match null / undefined", () => {
    assert.equal(isOverdueInvoiceError(null), false);
    assert.equal(isOverdueInvoiceError(undefined), false);
  });

  it("does NOT match an error with no message", () => {
    assert.equal(isOverdueInvoiceError({ code: "23505" }), false);
  });
});
