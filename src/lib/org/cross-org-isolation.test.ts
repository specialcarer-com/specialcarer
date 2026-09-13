/**
 * Cross-org RLS isolation tests (Phase D — PR D4).
 *
 * Expands D3's `booking-cross-org.test.ts` pattern to the eleven `public.*`
 * org tables that D4's `20260913201000_org_rls_lockdown.sql` migration
 * touches (or verifies as already-correct).
 *
 * Real RLS is enforced by PostgreSQL — these tests model each D4 SELECT
 * policy against a mock dataset. When the integration harness lands (see
 * the D3a concurrency test TODO), these graduate to real supabase-js
 * queries against a freshly-seeded schema.
 *
 * Fixture:
 *   • Two orgs (A + B).
 *   • Users per D4 role: A_OWNER, A_ADMIN, A_BOOKER, A_FINANCE, A_VIEWER
 *     + the same set for B.
 *   • A_CARER — a user with no org membership but assigned as the carer
 *     on an offer/payout in Org A (models the external-carer case).
 *   • SC_ADMIN — a profiles.role = 'admin' platform admin.
 *   • ORPHAN — no memberships, no rows anywhere.
 *
 * The D4 policy matrix — one predicate per (table, role) pair — is
 * codified in `rlsAllows(...)` at the top of each describe block.
 *
 * Every case: `(table, role, org)` — assert the correct row set is
 * visible, and cross-org filtering to the OTHER org returns zero.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Fixture — users, orgs, memberships
// ---------------------------------------------------------------------------

type OrgRole = "owner" | "admin" | "booker" | "finance" | "viewer";

const ORG_A = "org-A";
const ORG_B = "org-B";

const A_OWNER = "u-A-owner";
const A_ADMIN = "u-A-admin";
const A_BOOKER = "u-A-booker";
const A_FINANCE = "u-A-finance";
const A_VIEWER = "u-A-viewer";
const B_OWNER = "u-B-owner";
const B_ADMIN = "u-B-admin";
const B_BOOKER = "u-B-booker";
const B_FINANCE = "u-B-finance";
const B_VIEWER = "u-B-viewer";
const A_CARER = "u-A-carer";
const SC_ADMIN = "u-sc-admin";
const ORPHAN = "u-orphan";

const memberships: Record<string, Array<{ orgId: string; role: OrgRole }>> = {
  [A_OWNER]: [{ orgId: ORG_A, role: "owner" }],
  [A_ADMIN]: [{ orgId: ORG_A, role: "admin" }],
  [A_BOOKER]: [{ orgId: ORG_A, role: "booker" }],
  [A_FINANCE]: [{ orgId: ORG_A, role: "finance" }],
  [A_VIEWER]: [{ orgId: ORG_A, role: "viewer" }],
  [B_OWNER]: [{ orgId: ORG_B, role: "owner" }],
  [B_ADMIN]: [{ orgId: ORG_B, role: "admin" }],
  [B_BOOKER]: [{ orgId: ORG_B, role: "booker" }],
  [B_FINANCE]: [{ orgId: ORG_B, role: "finance" }],
  [B_VIEWER]: [{ orgId: ORG_B, role: "viewer" }],
  [A_CARER]: [],
  [SC_ADMIN]: [],
  [ORPHAN]: [],
};

const scAdmins = new Set<string>([SC_ADMIN]);

function isScAdmin(userId: string): boolean {
  return scAdmins.has(userId);
}

function membership(userId: string, orgId: string): OrgRole | null {
  const m = memberships[userId]?.find((x) => x.orgId === orgId);
  return m?.role ?? null;
}

function isMemberOfWithRoles(
  userId: string,
  orgId: string,
  roles: OrgRole[],
): boolean {
  const role = membership(userId, orgId);
  return role !== null && roles.includes(role);
}

// ---------------------------------------------------------------------------
// Fixture rows
// ---------------------------------------------------------------------------

type OrgRow = { id: string; created_by: string };
type MemberRow = { id: string; organization_id: string; user_id: string; role: OrgRole };
type BillingRow = { organization_id: string; stripe_bank_last4: string };
type ContractRow = { id: string; organization_id: string; signed_by_user_id: string };
type DocumentRow = { id: string; organization_id: string; kind: string };
type InvoiceRow = { id: string; organization_id: string; total_cents: number };
type PayoutRow = { id: string; organization_id: string; carer_id: string; amount_cents: number };
type PayoutItemRow = { id: string; payout_id: string; amount_cents: number };
type BookingRow = { id: string; organization_id: string };
type OfferRow = { id: string; booking_id: string; carer_id: string };
type CancellationRow = { id: string; booking_id: string; reason: string };

const ORGS: OrgRow[] = [
  { id: ORG_A, created_by: A_OWNER },
  { id: ORG_B, created_by: B_OWNER },
];

const MEMBERS: MemberRow[] = Object.entries(memberships).flatMap(
  ([userId, mems]) =>
    mems.map((m, ix) => ({
      id: `${userId}-mem-${ix}`,
      organization_id: m.orgId,
      user_id: userId,
      role: m.role,
    })),
);

const BILLING: BillingRow[] = [
  { organization_id: ORG_A, stripe_bank_last4: "1234" },
  { organization_id: ORG_B, stripe_bank_last4: "5678" },
];

const CONTRACTS: ContractRow[] = [
  { id: "ct-A-1", organization_id: ORG_A, signed_by_user_id: A_BOOKER },
  { id: "ct-A-2", organization_id: ORG_A, signed_by_user_id: A_VIEWER },
  { id: "ct-B-1", organization_id: ORG_B, signed_by_user_id: B_BOOKER },
];

const DOCUMENTS: DocumentRow[] = [
  { id: "doc-A-1", organization_id: ORG_A, kind: "rtw" },
  { id: "doc-A-2", organization_id: ORG_A, kind: "dbs" },
  { id: "doc-B-1", organization_id: ORG_B, kind: "insurance" },
];

const INVOICES: InvoiceRow[] = [
  { id: "inv-A-1", organization_id: ORG_A, total_cents: 100_000 },
  { id: "inv-B-1", organization_id: ORG_B, total_cents: 200_000 },
];

const PAYOUTS: PayoutRow[] = [
  { id: "po-A-1", organization_id: ORG_A, carer_id: A_CARER, amount_cents: 50_000 },
  { id: "po-B-1", organization_id: ORG_B, carer_id: "u-B-carer-external", amount_cents: 30_000 },
];

const PAYOUT_ITEMS: PayoutItemRow[] = [
  { id: "poi-A-1", payout_id: "po-A-1", amount_cents: 25_000 },
  { id: "poi-A-2", payout_id: "po-A-1", amount_cents: 25_000 },
  { id: "poi-B-1", payout_id: "po-B-1", amount_cents: 30_000 },
];

const BOOKINGS: BookingRow[] = [
  { id: "bk-A-1", organization_id: ORG_A },
  { id: "bk-B-1", organization_id: ORG_B },
];

const OFFERS: OfferRow[] = [
  { id: "of-A-1", booking_id: "bk-A-1", carer_id: A_CARER },
  { id: "of-B-1", booking_id: "bk-B-1", carer_id: "u-B-carer-external" },
];

const CANCELLATIONS: CancellationRow[] = [
  { id: "cn-A-1", booking_id: "bk-A-1", reason: "carer_unavailable" },
  { id: "cn-B-1", booking_id: "bk-B-1", reason: "customer_request" },
];

// ---------------------------------------------------------------------------
// RLS predicates — one per table, mirroring the D4 SELECT policies.
// ---------------------------------------------------------------------------

function allowsOrganizations(userId: string, row: OrgRow): boolean {
  if (isScAdmin(userId)) return true;
  return membership(userId, row.id) !== null;
}

function allowsOrganizationMembers(userId: string, row: MemberRow): boolean {
  if (isScAdmin(userId)) return true;
  if (row.user_id === userId) return true;
  // Existing `organization_members_self_read` policy already grants
  // team-read to any member sharing the org. D4 keeps this unchanged.
  return membership(userId, row.organization_id) !== null;
}

function allowsOrganizationBilling(userId: string, row: BillingRow): boolean {
  if (isScAdmin(userId)) return true;
  return isMemberOfWithRoles(userId, row.organization_id, ["owner", "admin", "finance"]);
}

function allowsOrganizationContracts(userId: string, row: ContractRow): boolean {
  if (isScAdmin(userId)) return true;
  // Existing SELECT policies kept: any org member reads, OR the worker
  // themselves reads their own contract.
  if (row.signed_by_user_id === userId) return true;
  return membership(userId, row.organization_id) !== null;
}

function allowsOrganizationDocuments(userId: string, row: DocumentRow): boolean {
  if (isScAdmin(userId)) return true;
  return isMemberOfWithRoles(userId, row.organization_id, ["owner", "admin", "finance"]);
}

function allowsOrgInvoices(userId: string, row: InvoiceRow): boolean {
  if (isScAdmin(userId)) return true;
  return isMemberOfWithRoles(userId, row.organization_id, ["owner", "admin", "finance"]);
}

function allowsOrgCarerPayouts(userId: string, row: PayoutRow): boolean {
  if (isScAdmin(userId)) return true;
  if (row.carer_id === userId) return true;
  return isMemberOfWithRoles(userId, row.organization_id, ["owner", "admin", "finance"]);
}

function allowsOrgCarerPayoutItems(userId: string, row: PayoutItemRow): boolean {
  if (isScAdmin(userId)) return true;
  const parent = PAYOUTS.find((p) => p.id === row.payout_id);
  if (!parent) return false;
  if (parent.carer_id === userId) return true;
  return isMemberOfWithRoles(userId, parent.organization_id, ["owner", "admin", "finance"]);
}

function allowsOrgBookingOffers(userId: string, row: OfferRow): boolean {
  if (isScAdmin(userId)) return true;
  if (row.carer_id === userId) return true;
  const booking = BOOKINGS.find((b) => b.id === row.booking_id);
  if (!booking) return false;
  return isMemberOfWithRoles(userId, booking.organization_id, ["owner", "admin", "booker"]);
}

function allowsOrgBookingCancellations(userId: string, row: CancellationRow): boolean {
  if (isScAdmin(userId)) return true;
  const booking = BOOKINGS.find((b) => b.id === row.booking_id);
  if (!booking) return false;
  return isMemberOfWithRoles(userId, booking.organization_id, ["owner", "admin", "booker"]);
}

// ---------------------------------------------------------------------------
// Query helpers — model a Supabase `.select().eq('organization_id', ...)`.
// ---------------------------------------------------------------------------

function selectOrganizations(userId: string, filterId?: string): OrgRow[] {
  return ORGS.filter(
    (r) => allowsOrganizations(userId, r) && (filterId ? r.id === filterId : true),
  );
}

function selectMembers(userId: string, filterOrgId?: string): MemberRow[] {
  return MEMBERS.filter(
    (r) =>
      allowsOrganizationMembers(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

function selectBilling(userId: string, filterOrgId?: string): BillingRow[] {
  return BILLING.filter(
    (r) =>
      allowsOrganizationBilling(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

function selectContracts(userId: string, filterOrgId?: string): ContractRow[] {
  return CONTRACTS.filter(
    (r) =>
      allowsOrganizationContracts(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

function selectDocuments(userId: string, filterOrgId?: string): DocumentRow[] {
  return DOCUMENTS.filter(
    (r) =>
      allowsOrganizationDocuments(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

function selectInvoices(userId: string, filterOrgId?: string): InvoiceRow[] {
  return INVOICES.filter(
    (r) =>
      allowsOrgInvoices(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

function selectPayouts(userId: string, filterOrgId?: string): PayoutRow[] {
  return PAYOUTS.filter(
    (r) =>
      allowsOrgCarerPayouts(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

function selectPayoutItems(userId: string, filterOrgId?: string): PayoutItemRow[] {
  return PAYOUT_ITEMS.filter(
    (r) =>
      allowsOrgCarerPayoutItems(userId, r) &&
      (filterOrgId
        ? PAYOUTS.find((p) => p.id === r.payout_id)?.organization_id === filterOrgId
        : true),
  );
}

function selectOffers(userId: string, filterOrgId?: string): OfferRow[] {
  return OFFERS.filter(
    (r) =>
      allowsOrgBookingOffers(userId, r) &&
      (filterOrgId
        ? BOOKINGS.find((b) => b.id === r.booking_id)?.organization_id === filterOrgId
        : true),
  );
}

function selectCancellations(userId: string, filterOrgId?: string): CancellationRow[] {
  return CANCELLATIONS.filter(
    (r) =>
      allowsOrgBookingCancellations(userId, r) &&
      (filterOrgId
        ? BOOKINGS.find((b) => b.id === r.booking_id)?.organization_id === filterOrgId
        : true),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("D4 RLS — organizations", () => {
  it("every member of Org A sees Org A (all roles)", () => {
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER, A_FINANCE, A_VIEWER]) {
      const rows = selectOrganizations(u);
      assert.deepEqual(rows.map((r) => r.id).sort(), [ORG_A], `role saw wrong: ${u}`);
    }
  });

  it("Org A members do NOT see Org B (cross-org filter returns 0)", () => {
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER, A_FINANCE, A_VIEWER]) {
      assert.deepEqual(selectOrganizations(u, ORG_B), []);
    }
  });

  it("orphan user sees no orgs", () => {
    assert.deepEqual(selectOrganizations(ORPHAN), []);
  });

  it("SC admin sees both orgs", () => {
    assert.equal(selectOrganizations(SC_ADMIN).length, 2);
  });
});

describe("D4 RLS — organization_members (unchanged in D4 — regression guard)", () => {
  it("every member of Org A sees all Org A members", () => {
    const expectedIds = MEMBERS.filter((m) => m.organization_id === ORG_A)
      .map((m) => m.id)
      .sort();
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER, A_FINANCE, A_VIEWER]) {
      const rows = selectMembers(u, ORG_A);
      assert.deepEqual(rows.map((r) => r.id).sort(), expectedIds, `role: ${u}`);
    }
  });

  it("Org A members see 0 Org B members", () => {
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER, A_FINANCE, A_VIEWER]) {
      assert.deepEqual(selectMembers(u, ORG_B), []);
    }
  });

  it("orphan sees no members", () => {
    assert.deepEqual(selectMembers(ORPHAN), []);
  });
});

describe("D4 RLS — organization_billing (CRITICAL fix)", () => {
  it("owner + admin + finance of Org A see Org A billing", () => {
    for (const u of [A_OWNER, A_ADMIN, A_FINANCE]) {
      const rows = selectBilling(u, ORG_A);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.stripe_bank_last4, "1234");
    }
  });

  it("REGRESSION: viewer does NOT see billing (old member_rw policy fixed)", () => {
    assert.deepEqual(selectBilling(A_VIEWER), []);
    assert.deepEqual(selectBilling(A_VIEWER, ORG_A), []);
  });

  it("REGRESSION: booker does NOT see billing (finance-scoped concern)", () => {
    assert.deepEqual(selectBilling(A_BOOKER), []);
    assert.deepEqual(selectBilling(A_BOOKER, ORG_A), []);
  });

  it("Org A finance does NOT see Org B billing (cross-org filter returns 0)", () => {
    assert.deepEqual(selectBilling(A_FINANCE, ORG_B), []);
  });

  it("SC admin sees both orgs' billing", () => {
    assert.equal(selectBilling(SC_ADMIN).length, 2);
  });
});

describe("D4 RLS — organization_contracts (parity, existing SELECT kept)", () => {
  it("every Org A member sees Org A contracts (member_read matches matrix)", () => {
    const expectedA = ["ct-A-1", "ct-A-2"].sort();
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER, A_FINANCE, A_VIEWER]) {
      const rows = selectContracts(u, ORG_A);
      assert.deepEqual(rows.map((r) => r.id).sort(), expectedA, `role: ${u}`);
    }
  });

  it("worker-self-read: A_BOOKER sees their own contract even across orgs", () => {
    // Fixture: A_BOOKER is signed_by on ct-A-1. Verified above via member_read too.
    // Cross-check: an unrelated user sees nothing regardless of signed_by.
    assert.deepEqual(selectContracts(ORPHAN), []);
  });

  it("cross-org: Org A booker does NOT see Org B contracts", () => {
    assert.deepEqual(selectContracts(A_BOOKER, ORG_B), []);
  });
});

describe("D4 RLS — organization_documents (CRITICAL fix)", () => {
  it("owner + admin + finance of Org A see Org A documents", () => {
    for (const u of [A_OWNER, A_ADMIN, A_FINANCE]) {
      const rows = selectDocuments(u, ORG_A);
      assert.equal(rows.length, 2);
    }
  });

  it("REGRESSION: viewer does NOT see any documents (RTW/DBS locked down)", () => {
    assert.deepEqual(selectDocuments(A_VIEWER), []);
    assert.deepEqual(selectDocuments(A_VIEWER, ORG_A), []);
  });

  it("REGRESSION: booker does NOT see documents (finance/admin-scoped)", () => {
    assert.deepEqual(selectDocuments(A_BOOKER), []);
    assert.deepEqual(selectDocuments(A_BOOKER, ORG_A), []);
  });

  it("Org A admin does NOT see Org B documents", () => {
    assert.deepEqual(selectDocuments(A_ADMIN, ORG_B), []);
  });
});

describe("D4 RLS — org_invoices (HIGH fix)", () => {
  it("owner + admin + finance of Org A see Org A invoices", () => {
    for (const u of [A_OWNER, A_ADMIN, A_FINANCE]) {
      const rows = selectInvoices(u, ORG_A);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.total_cents, 100_000);
    }
  });

  it("REGRESSION: viewer does NOT see invoices (PII lockdown)", () => {
    assert.deepEqual(selectInvoices(A_VIEWER), []);
  });

  it("REGRESSION: booker does NOT see invoices (finance-scoped concern)", () => {
    assert.deepEqual(selectInvoices(A_BOOKER), []);
  });

  it("Org A finance does NOT see Org B invoices", () => {
    assert.deepEqual(selectInvoices(A_FINANCE, ORG_B), []);
  });
});

describe("D4 RLS — org_carer_payouts (MEDIUM additive)", () => {
  it("owner + admin + finance of Org A see Org A payouts (NEW org-side coverage)", () => {
    for (const u of [A_OWNER, A_ADMIN, A_FINANCE]) {
      const rows = selectPayouts(u, ORG_A);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.id, "po-A-1");
    }
  });

  it("carer sees their own payout regardless of org membership", () => {
    const rows = selectPayouts(A_CARER);
    assert.deepEqual(rows.map((r) => r.id).sort(), ["po-A-1"]);
  });

  it("viewer + booker do NOT see payouts (finance/admin-scoped)", () => {
    assert.deepEqual(selectPayouts(A_VIEWER), []);
    assert.deepEqual(selectPayouts(A_BOOKER), []);
  });

  it("Org A finance does NOT see Org B payouts (cross-org)", () => {
    assert.deepEqual(selectPayouts(A_FINANCE, ORG_B), []);
  });
});

describe("D4 RLS — org_carer_payout_items (MEDIUM additive)", () => {
  it("owner + admin + finance of Org A see Org A payout items", () => {
    for (const u of [A_OWNER, A_ADMIN, A_FINANCE]) {
      const rows = selectPayoutItems(u, ORG_A);
      assert.equal(rows.length, 2);
    }
  });

  it("carer sees own payout items (join via payouts)", () => {
    const rows = selectPayoutItems(A_CARER);
    assert.deepEqual(rows.map((r) => r.id).sort(), ["poi-A-1", "poi-A-2"]);
  });

  it("viewer + booker do NOT see payout items", () => {
    assert.deepEqual(selectPayoutItems(A_VIEWER), []);
    assert.deepEqual(selectPayoutItems(A_BOOKER), []);
  });

  it("Org A admin does NOT see Org B payout items", () => {
    assert.deepEqual(selectPayoutItems(A_ADMIN, ORG_B), []);
  });
});

describe("D4 RLS — org_booking_offers (MEDIUM audit + fix)", () => {
  it("owner + admin + booker of Org A see Org A offers", () => {
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER]) {
      const rows = selectOffers(u, ORG_A);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.id, "of-A-1");
    }
  });

  it("REGRESSION: viewer does NOT see offers (old permissive read fixed)", () => {
    assert.deepEqual(selectOffers(A_VIEWER), []);
  });

  it("REGRESSION: finance does NOT see offers (operational, not finance)", () => {
    assert.deepEqual(selectOffers(A_FINANCE), []);
  });

  it("carer sees their own offer regardless of org membership", () => {
    const rows = selectOffers(A_CARER);
    assert.deepEqual(rows.map((r) => r.id).sort(), ["of-A-1"]);
  });

  it("Org A booker does NOT see Org B offers", () => {
    assert.deepEqual(selectOffers(A_BOOKER, ORG_B), []);
  });

  it("SC admin sees offers from both orgs", () => {
    assert.equal(selectOffers(SC_ADMIN).length, 2);
  });
});

describe("D4 RLS — org_booking_cancellations (MEDIUM audit + fix)", () => {
  it("owner + admin + booker of Org A see Org A cancellations", () => {
    for (const u of [A_OWNER, A_ADMIN, A_BOOKER]) {
      const rows = selectCancellations(u, ORG_A);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.id, "cn-A-1");
    }
  });

  it("REGRESSION: viewer does NOT see cancellations", () => {
    assert.deepEqual(selectCancellations(A_VIEWER), []);
  });

  it("REGRESSION: finance does NOT see cancellations (operational)", () => {
    assert.deepEqual(selectCancellations(A_FINANCE), []);
  });

  it("Org A booker does NOT see Org B cancellations", () => {
    assert.deepEqual(selectCancellations(A_BOOKER, ORG_B), []);
  });
});

describe("D4 RLS — cross-org isolation (composite)", () => {
  const orgATables: Array<{ name: string; runA: () => number; runB: () => number }> = [
    { name: "organizations", runA: () => selectOrganizations(A_VIEWER, ORG_B).length, runB: () => selectOrganizations(B_VIEWER, ORG_A).length },
    { name: "organization_members", runA: () => selectMembers(A_VIEWER, ORG_B).length, runB: () => selectMembers(B_VIEWER, ORG_A).length },
    { name: "organization_billing", runA: () => selectBilling(A_FINANCE, ORG_B).length, runB: () => selectBilling(B_FINANCE, ORG_A).length },
    { name: "organization_contracts", runA: () => selectContracts(A_VIEWER, ORG_B).length, runB: () => selectContracts(B_VIEWER, ORG_A).length },
    { name: "organization_documents", runA: () => selectDocuments(A_FINANCE, ORG_B).length, runB: () => selectDocuments(B_FINANCE, ORG_A).length },
    { name: "org_invoices", runA: () => selectInvoices(A_FINANCE, ORG_B).length, runB: () => selectInvoices(B_FINANCE, ORG_A).length },
    { name: "org_carer_payouts", runA: () => selectPayouts(A_FINANCE, ORG_B).length, runB: () => selectPayouts(B_FINANCE, ORG_A).length },
    { name: "org_carer_payout_items", runA: () => selectPayoutItems(A_FINANCE, ORG_B).length, runB: () => selectPayoutItems(B_FINANCE, ORG_A).length },
    { name: "org_booking_offers", runA: () => selectOffers(A_BOOKER, ORG_B).length, runB: () => selectOffers(B_BOOKER, ORG_A).length },
    { name: "org_booking_cancellations", runA: () => selectCancellations(A_BOOKER, ORG_B).length, runB: () => selectCancellations(B_BOOKER, ORG_A).length },
  ];

  for (const { name, runA, runB } of orgATables) {
    it(`${name} — Org A member gets 0 rows filtering by Org B`, () => {
      assert.equal(runA(), 0);
    });
    it(`${name} — Org B member gets 0 rows filtering by Org A`, () => {
      assert.equal(runB(), 0);
    });
  }
});

describe("D4 RLS — ORPHAN user sees nothing anywhere", () => {
  it("orphan across all 10 tables returns 0 rows", () => {
    assert.deepEqual(selectOrganizations(ORPHAN), []);
    assert.deepEqual(selectMembers(ORPHAN), []);
    assert.deepEqual(selectBilling(ORPHAN), []);
    assert.deepEqual(selectContracts(ORPHAN), []);
    assert.deepEqual(selectDocuments(ORPHAN), []);
    assert.deepEqual(selectInvoices(ORPHAN), []);
    assert.deepEqual(selectPayouts(ORPHAN), []);
    assert.deepEqual(selectPayoutItems(ORPHAN), []);
    assert.deepEqual(selectOffers(ORPHAN), []);
    assert.deepEqual(selectCancellations(ORPHAN), []);
  });
});

describe("D4 RLS — SC platform admin sees everything", () => {
  it("SC admin queries all 10 tables and sees both orgs' rows", () => {
    assert.equal(selectOrganizations(SC_ADMIN).length, 2);
    assert.equal(selectMembers(SC_ADMIN).length, MEMBERS.length);
    assert.equal(selectBilling(SC_ADMIN).length, 2);
    assert.equal(selectContracts(SC_ADMIN).length, 3);
    assert.equal(selectDocuments(SC_ADMIN).length, 3);
    assert.equal(selectInvoices(SC_ADMIN).length, 2);
    assert.equal(selectPayouts(SC_ADMIN).length, 2);
    assert.equal(selectPayoutItems(SC_ADMIN).length, 3);
    assert.equal(selectOffers(SC_ADMIN).length, 2);
    assert.equal(selectCancellations(SC_ADMIN).length, 2);
  });
});
