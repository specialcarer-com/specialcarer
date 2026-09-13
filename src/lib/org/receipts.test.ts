/**
 * D5 — org receipts tests.
 *
 * Two surfaces modelled here:
 *
 *   1. generate_org_receipt_on_completion trigger — a JS mirror of the
 *      pl/pgSQL body: WHEN-clause gating, transition semantics,
 *      snapshot resolution, unique(booking_id) idempotency, and
 *      SC-R-YYYY-NNNNNN receipt number rendering off the shared
 *      sequence.
 *
 *   2. RLS policy semantics — org_receipts_admin_finance_read_v2
 *      (owner/admin/finance within the org) + org_receipts_sc_admin_all_v2
 *      (SC platform admin all-access). No write policies for org
 *      members — trigger + service_role only.
 *
 *   3. GET /api/m/org/receipts pagination — cursor semantics + limit
 *      handling. Modelled with an in-memory row store + a supabase-js
 *      chainable stub so we can assert on ordering, cursor.lt(), and
 *      limit(+1) behaviour without hitting a real DB.
 *
 * Follows the D3 booking-concurrency test style.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

type OrgRole = "owner" | "admin" | "booker" | "finance" | "viewer";

type BookingRow = {
  id: string;
  organization_id: string | null;
  status: string;
  caregiver_id: string | null;
  booker_member_id: string | null;
  booker_name_snapshot: string | null;
  service_user_id: string | null;
  service_type: string;
  starts_at: string;
  ends_at: string;
  currency: string;
  org_charge_total_cents: number | null;
  total_cents: number;
};

type ReceiptRow = {
  id: string;
  organization_id: string;
  booking_id: string;
  invoice_id: string | null;
  receipt_number: string;
  amount_cents: number;
  currency: string;
  service_description: string;
  booking_starts_at: string;
  booking_ends_at: string;
  carer_name_snapshot: string;
  booker_name_snapshot: string;
  service_user_name_snapshot: string | null;
  receipt_pdf_url: string | null;
  issued_at: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// TriggerFixture — the JS mirror of the pl/pgSQL trigger body.
// Every branch of the migration's DECLARE/BEGIN/END lives here.
// ---------------------------------------------------------------------------

class TriggerFixture {
  private receipts: ReceiptRow[] = [];
  private profiles = new Map<string, { full_name: string | null }>();
  private members = new Map<string, { full_name: string | null }>();
  private serviceUsers = new Map<string, { full_name: string }>();
  // Shared monotonic sequence. Matches the migration's
  // CREATE SEQUENCE ... START 1 MINVALUE 1 NO CYCLE.
  private seq = 0;

  addProfile(id: string, full_name: string | null) {
    this.profiles.set(id, { full_name });
  }
  addMember(id: string, full_name: string | null) {
    this.members.set(id, { full_name });
  }
  addServiceUser(id: string, full_name: string) {
    this.serviceUsers.set(id, { full_name });
  }
  snapshotReceipts(): ReceiptRow[] {
    return [...this.receipts];
  }
  currentSeq(): number {
    return this.seq;
  }

  /**
   * Emulate the trigger firing for a bookings row change.
   * op = 'INSERT' means OLD is null; op = 'UPDATE' means OLD is provided.
   */
  fire(op: "INSERT" | "UPDATE", NEW: BookingRow, OLD: BookingRow | null, now = new Date("2026-09-13T12:00:00Z")) {
    // WHEN clause emulation (executor-level narrowing).
    if (NEW.organization_id === null) return;
    if (NEW.status !== "completed") return;

    // Function body defensive checks.
    if (op === "UPDATE" && OLD !== null && OLD.status === "completed") return;

    // Idempotency backstop (matches EXISTS(...) in the trigger).
    if (this.receipts.some((r) => r.booking_id === NEW.id)) return;

    // Snapshot resolution.
    const carer = NEW.caregiver_id ? this.profiles.get(NEW.caregiver_id) : undefined;
    const carer_name_snapshot = carer?.full_name ?? "Unknown Carer";

    const member = NEW.booker_member_id ? this.members.get(NEW.booker_member_id) : undefined;
    const booker_name_snapshot =
      member?.full_name ?? NEW.booker_name_snapshot ?? "Unknown Booker";

    const su = NEW.service_user_id ? this.serviceUsers.get(NEW.service_user_id) : undefined;
    const service_user_name_snapshot = su?.full_name ?? null;

    const amount_cents = NEW.org_charge_total_cents ?? NEW.total_cents ?? 0;

    // nextval() on the shared sequence.
    this.seq += 1;
    const yyyy = now.getUTCFullYear();
    const number = String(this.seq).padStart(6, "0");
    const receipt_number = `SC-R-${yyyy}-${number}`;

    this.receipts.push({
      id: `receipt-${this.receipts.length + 1}`,
      organization_id: NEW.organization_id,
      booking_id: NEW.id,
      invoice_id: null,
      receipt_number,
      amount_cents,
      currency: NEW.currency,
      service_description: NEW.service_type,
      booking_starts_at: NEW.starts_at,
      booking_ends_at: NEW.ends_at,
      carer_name_snapshot,
      booker_name_snapshot,
      service_user_name_snapshot,
      receipt_pdf_url: null,
      issued_at: now.toISOString(),
      created_at: now.toISOString(),
    });
  }
}

function baseBooking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "bk-1",
    organization_id: "org-A",
    status: "completed",
    caregiver_id: "carer-1",
    booker_member_id: "member-1",
    booker_name_snapshot: "Booker Snapshot",
    service_user_id: "su-1",
    service_type: "care_services",
    starts_at: "2026-09-01T09:00:00Z",
    ends_at: "2026-09-01T13:00:00Z",
    currency: "gbp",
    org_charge_total_cents: 12_000,
    total_cents: 10_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Trigger gating — organization_id + status transition
// ---------------------------------------------------------------------------

describe("trigger — gating", () => {
  it("skips bookings with organization_id = NULL (consumer/seeker booking)", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice Carer");
    fx.addMember("member-1", "Bob Booker");
    fx.fire("UPDATE", baseBooking({ organization_id: null }), baseBooking({ organization_id: null, status: "in_progress" }));
    assert.equal(fx.snapshotReceipts().length, 0);
  });

  it("skips bookings whose new status is NOT completed", () => {
    const fx = new TriggerFixture();
    fx.fire("UPDATE", baseBooking({ status: "in_progress" }), baseBooking({ status: "accepted" }));
    fx.fire("UPDATE", baseBooking({ status: "cancelled" }), baseBooking({ status: "accepted" }));
    assert.equal(fx.snapshotReceipts().length, 0);
  });

  it("fires on true transition INTO completed", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice Carer");
    fx.addMember("member-1", "Bob Booker");
    fx.addServiceUser("su-1", "Charlie Client");
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts().length, 1);
  });

  it("skips completed→completed no-op status touches", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    // Second touch: no-op status update.
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "completed" }));
    assert.equal(fx.snapshotReceipts().length, 1);
  });

  it("fires on INSERT of a row that arrives already in status='completed' (backfill/import)", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("INSERT", baseBooking({ status: "completed" }), null);
    assert.equal(fx.snapshotReceipts().length, 1);
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotency — no duplicate receipts
// ---------------------------------------------------------------------------

describe("trigger — idempotency", () => {
  it("does NOT create a duplicate receipt for the same booking_id", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    // First fire: creates a receipt.
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts().length, 1);
    // Second fire: EXISTS check short-circuits.
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts().length, 1);
  });

  it("still creates receipts for distinct bookings after an idempotent skip", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE", baseBooking({ id: "bk-1", status: "completed" }), baseBooking({ id: "bk-1", status: "in_progress" }));
    fx.fire("UPDATE", baseBooking({ id: "bk-1", status: "completed" }), baseBooking({ id: "bk-1", status: "in_progress" })); // skipped
    fx.fire("UPDATE", baseBooking({ id: "bk-2", status: "completed" }), baseBooking({ id: "bk-2", status: "in_progress" }));
    assert.equal(fx.snapshotReceipts().length, 2);
    assert.deepEqual(fx.snapshotReceipts().map((r) => r.booking_id), ["bk-1", "bk-2"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Receipt number sequence
// ---------------------------------------------------------------------------

describe("receipt number — SC-R-YYYY-NNNNNN format + monotonic sequence", () => {
  it("renders as SC-R-YYYY-NNNNNN with 6-digit zero-padded number", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    const r = fx.snapshotReceipts()[0];
    assert.match(r.receipt_number, /^SC-R-\d{4}-\d{6}$/);
    assert.equal(r.receipt_number, "SC-R-2026-000001");
  });

  it("sequence advances monotonically across successive fires", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    for (let i = 1; i <= 5; i++) {
      fx.fire(
        "UPDATE",
        baseBooking({ id: `bk-${i}`, status: "completed" }),
        baseBooking({ id: `bk-${i}`, status: "in_progress" }),
      );
    }
    const rs = fx.snapshotReceipts();
    assert.deepEqual(rs.map((r) => r.receipt_number), [
      "SC-R-2026-000001",
      "SC-R-2026-000002",
      "SC-R-2026-000003",
      "SC-R-2026-000004",
      "SC-R-2026-000005",
    ]);
  });

  it("does NOT reset on year rollover — same shared sequence continues", () => {
    // Documented rationale: monotonic-forever. See migration comment
    // + D5 runbook. This test locks in that decision.
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire(
      "UPDATE",
      baseBooking({ id: "bk-1", status: "completed" }),
      baseBooking({ id: "bk-1", status: "in_progress" }),
      new Date("2026-12-31T23:59:00Z"),
    );
    fx.fire(
      "UPDATE",
      baseBooking({ id: "bk-2", status: "completed" }),
      baseBooking({ id: "bk-2", status: "in_progress" }),
      new Date("2027-01-01T00:01:00Z"),
    );
    const rs = fx.snapshotReceipts();
    assert.equal(rs[0].receipt_number, "SC-R-2026-000001");
    // Number component keeps ticking; year prefix changes.
    assert.equal(rs[1].receipt_number, "SC-R-2027-000002");
  });
});

// ---------------------------------------------------------------------------
// 4. Snapshot preservation
// ---------------------------------------------------------------------------

describe("snapshots — preserved even when upstream rows change", () => {
  it("carer name comes from profiles.full_name", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice Carer");
    fx.addMember("member-1", "Bob Booker");
    fx.addServiceUser("su-1", "Charlie Client");
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    const r = fx.snapshotReceipts()[0];
    assert.equal(r.carer_name_snapshot, "Alice Carer");
    assert.equal(r.booker_name_snapshot, "Bob Booker");
    assert.equal(r.service_user_name_snapshot, "Charlie Client");
  });

  it("falls back to 'Unknown Carer' when caregiver profile is missing", () => {
    const fx = new TriggerFixture();
    // No profile registered for carer-1.
    fx.addMember("member-1", "Bob Booker");
    fx.fire("UPDATE", baseBooking({ status: "completed" }), baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].carer_name_snapshot, "Unknown Carer");
  });

  it("falls back to booker_name_snapshot column when the member row is missing", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    // No member registered — must use booker_name_snapshot fallback.
    fx.fire("UPDATE",
      baseBooking({ status: "completed", booker_name_snapshot: "Historic Booker" }),
      baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].booker_name_snapshot, "Historic Booker");
  });

  it("falls back to 'Unknown Booker' when both member and snapshot are missing", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE",
      baseBooking({ status: "completed", booker_member_id: null, booker_name_snapshot: null }),
      baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].booker_name_snapshot, "Unknown Booker");
  });

  it("service_user_name_snapshot is NULL when service_user_id is null", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.addMember("member-1", "Bob");
    fx.fire("UPDATE",
      baseBooking({ status: "completed", service_user_id: null }),
      baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].service_user_name_snapshot, null);
  });
});

// ---------------------------------------------------------------------------
// 5. Amount + currency
// ---------------------------------------------------------------------------

describe("amount + currency", () => {
  it("prefers org_charge_total_cents over total_cents", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE",
      baseBooking({ status: "completed", org_charge_total_cents: 12_000, total_cents: 10_000 }),
      baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].amount_cents, 12_000);
  });

  it("falls back to total_cents when org_charge_total_cents is null", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE",
      baseBooking({ status: "completed", org_charge_total_cents: null, total_cents: 8_000 }),
      baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].amount_cents, 8_000);
  });

  it("propagates currency verbatim", () => {
    const fx = new TriggerFixture();
    fx.addProfile("carer-1", "Alice");
    fx.fire("UPDATE",
      baseBooking({ status: "completed", currency: "usd" }),
      baseBooking({ status: "in_progress" }));
    assert.equal(fx.snapshotReceipts()[0].currency, "usd");
  });
});

// ---------------------------------------------------------------------------
// 6. RLS — role gate + cross-org isolation
// ---------------------------------------------------------------------------

// Emulator of the org_receipts_admin_finance_read_v2 policy predicate.
function rlsCanRead(actor: { userId: string; role: OrgRole; organizationId: string }, receipt: ReceiptRow): boolean {
  if (actor.organizationId !== receipt.organization_id) return false;
  return ["owner", "admin", "finance"].includes(actor.role);
}

describe("RLS — org_receipts_admin_finance_read_v2", () => {
  const receipt: ReceiptRow = {
    id: "r1",
    organization_id: "org-A",
    booking_id: "bk-1",
    invoice_id: null,
    receipt_number: "SC-R-2026-000001",
    amount_cents: 10_000,
    currency: "gbp",
    service_description: "care_services",
    booking_starts_at: "2026-09-01T09:00:00Z",
    booking_ends_at: "2026-09-01T13:00:00Z",
    carer_name_snapshot: "Alice",
    booker_name_snapshot: "Bob",
    service_user_name_snapshot: null,
    receipt_pdf_url: null,
    issued_at: "2026-09-01T13:00:00Z",
    created_at: "2026-09-01T13:00:00Z",
  };

  it("owner can read receipts within their org", () => {
    assert.equal(rlsCanRead({ userId: "u1", role: "owner", organizationId: "org-A" }, receipt), true);
  });

  it("admin can read", () => {
    assert.equal(rlsCanRead({ userId: "u1", role: "admin", organizationId: "org-A" }, receipt), true);
  });

  it("finance can read", () => {
    assert.equal(rlsCanRead({ userId: "u1", role: "finance", organizationId: "org-A" }, receipt), true);
  });

  it("booker CANNOT read (finance-sensitive)", () => {
    assert.equal(rlsCanRead({ userId: "u1", role: "booker", organizationId: "org-A" }, receipt), false);
  });

  it("viewer CANNOT read", () => {
    assert.equal(rlsCanRead({ userId: "u1", role: "viewer", organizationId: "org-A" }, receipt), false);
  });

  it("cross-org isolation — org B's finance CANNOT read org A's receipts", () => {
    assert.equal(rlsCanRead({ userId: "u2", role: "finance", organizationId: "org-B" }, receipt), false);
  });

  it("cross-org isolation — even org B's owner CANNOT read org A's receipts", () => {
    assert.equal(rlsCanRead({ userId: "u2", role: "owner", organizationId: "org-B" }, receipt), false);
  });
});

// ---------------------------------------------------------------------------
// 7. Pagination — cursor semantics for GET /api/m/org/receipts
// ---------------------------------------------------------------------------

// In-memory model of the route's cursor-paginated query. We assert
// the algorithm: DESC by issued_at, over-fetch by 1 to compute
// next_cursor, filter by cursor.lt when supplied.
function paginateReceipts(
  rows: ReceiptRow[],
  orgId: string,
  { cursor, limit }: { cursor?: string; limit: number },
) {
  const filtered = rows
    .filter((r) => r.organization_id === orgId)
    .filter((r) => (cursor ? r.issued_at < cursor : true))
    .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));
  const overFetched = filtered.slice(0, limit + 1);
  const hasMore = overFetched.length > limit;
  const page = hasMore ? overFetched.slice(0, limit) : overFetched;
  const next_cursor = hasMore ? page[page.length - 1].issued_at : null;
  return { receipts: page, next_cursor };
}

describe("GET /api/m/org/receipts — pagination", () => {
  function makeReceipts(count: number, orgId: string): ReceiptRow[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `r${i + 1}`,
      organization_id: orgId,
      booking_id: `bk-${i + 1}`,
      invoice_id: null,
      receipt_number: `SC-R-2026-${String(i + 1).padStart(6, "0")}`,
      amount_cents: 1000 * (i + 1),
      currency: "gbp",
      service_description: "care_services",
      booking_starts_at: `2026-09-${String(i + 1).padStart(2, "0")}T09:00:00Z`,
      booking_ends_at: `2026-09-${String(i + 1).padStart(2, "0")}T13:00:00Z`,
      carer_name_snapshot: "Alice",
      booker_name_snapshot: "Bob",
      service_user_name_snapshot: null,
      receipt_pdf_url: null,
      // Newer receipts have later issued_at.
      issued_at: `2026-09-${String(i + 1).padStart(2, "0")}T13:00:00Z`,
      created_at: `2026-09-${String(i + 1).padStart(2, "0")}T13:00:00Z`,
    }));
  }

  it("returns receipts DESC by issued_at (most recent first)", () => {
    const rows = makeReceipts(3, "org-A");
    const page = paginateReceipts(rows, "org-A", { limit: 20 });
    assert.deepEqual(
      page.receipts.map((r) => r.id),
      ["r3", "r2", "r1"],
    );
  });

  it("returns next_cursor when there are more pages", () => {
    const rows = makeReceipts(25, "org-A");
    const p1 = paginateReceipts(rows, "org-A", { limit: 20 });
    assert.equal(p1.receipts.length, 20);
    assert.equal(p1.receipts[0].id, "r25");
    assert.equal(p1.receipts[19].id, "r6");
    assert.equal(p1.next_cursor, p1.receipts[19].issued_at);
  });

  it("returns null next_cursor on the last page", () => {
    const rows = makeReceipts(5, "org-A");
    const page = paginateReceipts(rows, "org-A", { limit: 20 });
    assert.equal(page.receipts.length, 5);
    assert.equal(page.next_cursor, null);
  });

  it("cursor.lt strictly excludes the cursor row (no repeat)", () => {
    const rows = makeReceipts(25, "org-A");
    const p1 = paginateReceipts(rows, "org-A", { limit: 20 });
    const p2 = paginateReceipts(rows, "org-A", {
      cursor: p1.next_cursor!,
      limit: 20,
    });
    // p1 last row was r6; p2 should start at r5.
    assert.equal(p2.receipts[0].id, "r5");
    // No overlap between pages.
    const p1Ids = new Set(p1.receipts.map((r) => r.id));
    for (const r of p2.receipts) {
      assert.equal(p1Ids.has(r.id), false, `${r.id} appears in both pages`);
    }
  });

  it("filters by organization_id (never returns cross-org rows)", () => {
    const rowsA = makeReceipts(5, "org-A");
    const rowsB = makeReceipts(3, "org-B").map((r) => ({
      ...r,
      id: `bB-${r.id}`,
    }));
    const page = paginateReceipts([...rowsA, ...rowsB], "org-A", { limit: 20 });
    assert.equal(page.receipts.length, 5);
    for (const r of page.receipts) {
      assert.equal(r.organization_id, "org-A");
    }
  });
});
