/**
 * Cross-org RLS isolation tests (Phase D — PR D3).
 *
 * Real RLS is enforced by PostgreSQL — these tests model the four
 * D3 policies (bookings_org_admin_read_v2, bookings_org_booker_read_v2,
 * bookings_org_finance_read_v2, bookings_org_viewer_read_v2) plus
 * the pre-existing `parties can read own bookings` policy against a
 * mock dataset. When the integration harness lands (see the D3a
 * concurrency test TODO), these graduate to real supabase-js queries
 * against a freshly-seeded schema.
 *
 * The model:
 *   • Two orgs (A + B), each with 2 bookings.
 *   • User U is a viewer of A and NOT a member of B.
 *   • User V is a booker of B and NOT a member of A.
 *   • Consumer user S is not a member of any org but IS the seeker
 *     of one of B's bookings (models an org that hasn't fully
 *     migrated its consumer seekers).
 *
 * Assertions verify the D3 policy matrix — no user sees rows outside
 * their own org's scope; consumer users see only their own bookings
 * regardless of who created them.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

type Membership = {
  orgId: string;
  role: "owner" | "admin" | "booker" | "finance" | "viewer";
};

type BookingRow = {
  id: string;
  organization_id: string | null;
  seeker_id: string;
  caregiver_id: string | null;
  hourly_rate_cents: number;
};

const ORG_A = "org-A";
const ORG_B = "org-B";

const USER_U = "user-U"; // viewer of A
const USER_V = "user-V"; // booker of B
const USER_S = "user-S"; // consumer only (seeker of book-B-1)
const USER_C = "user-C"; // carer on book-A-1

const memberships: Record<string, Membership[]> = {
  [USER_U]: [{ orgId: ORG_A, role: "viewer" }],
  [USER_V]: [{ orgId: ORG_B, role: "booker" }],
  [USER_S]: [],
  [USER_C]: [],
};

const BOOKINGS: BookingRow[] = [
  {
    id: "book-A-1",
    organization_id: ORG_A,
    seeker_id: "seeker-A-shared",
    caregiver_id: USER_C,
    hourly_rate_cents: 3000,
  },
  {
    id: "book-A-2",
    organization_id: ORG_A,
    seeker_id: "seeker-A-shared",
    caregiver_id: null,
    hourly_rate_cents: 3500,
  },
  {
    id: "book-B-1",
    organization_id: ORG_B,
    seeker_id: USER_S, // consumer S is the seeker of a B booking
    caregiver_id: null,
    hourly_rate_cents: 4000,
  },
  {
    id: "book-B-2",
    organization_id: ORG_B,
    seeker_id: "seeker-B-other",
    caregiver_id: null,
    hourly_rate_cents: 4200,
  },
  {
    id: "book-consumer-1",
    organization_id: null, // pure seeker booking
    seeker_id: USER_S,
    caregiver_id: null,
    hourly_rate_cents: 2500,
  },
];

// ---------------------------------------------------------------------------
// RLS predicate — mirrors the four D3 SELECT policies + the pre-
// existing `parties can read own bookings`.
// ---------------------------------------------------------------------------

function rlsAllows(userId: string, row: BookingRow): boolean {
  // `parties can read own bookings` — seeker or caregiver.
  if (row.seeker_id === userId) return true;
  if (row.caregiver_id && row.caregiver_id === userId) return true;

  // The four D3 org policies collapse to: user is a member (any of
  // the four gated roles) of the row's org. Row's organization_id
  // must also be non-null for any of them to fire.
  if (!row.organization_id) return false;
  const mems = memberships[userId] ?? [];
  return mems.some(
    (m) =>
      m.orgId === row.organization_id &&
      ["owner", "admin", "booker", "finance", "viewer"].includes(m.role),
  );
}

function selectAll(userId: string, filterOrgId?: string): BookingRow[] {
  return BOOKINGS.filter(
    (r) =>
      rlsAllows(userId, r) &&
      (filterOrgId ? r.organization_id === filterOrgId : true),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cross-org isolation — viewer scope", () => {
  it("viewer of A sees only Org A rows when unfiltered", () => {
    const rows = selectAll(USER_U);
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.equal(r.organization_id, ORG_A, `leaked non-A row: ${r.id}`);
    }
  });

  it("viewer of A gets 0 rows filtering by Org B", () => {
    const rows = selectAll(USER_U, ORG_B);
    assert.deepEqual(rows.map((r) => r.id), []);
  });

  it("viewer of A gets Org A's 2 rows filtering by Org A", () => {
    const rows = selectAll(USER_U, ORG_A);
    assert.deepEqual(rows.map((r) => r.id).sort(), ["book-A-1", "book-A-2"]);
  });
});

describe("cross-org isolation — booker scope", () => {
  it("booker of B sees only Org B rows when unfiltered", () => {
    const rows = selectAll(USER_V);
    for (const r of rows) {
      assert.equal(r.organization_id, ORG_B, `leaked non-B row: ${r.id}`);
    }
    // Booker sees both B rows.
    assert.equal(rows.length, 2);
  });

  it("booker of B gets 0 rows filtering by Org A", () => {
    const rows = selectAll(USER_V, ORG_A);
    assert.deepEqual(rows.map((r) => r.id), []);
  });
});

describe("consumer / seeker rows are unaffected by org policies", () => {
  it("consumer S sees their own consumer booking (no org)", () => {
    const rows = selectAll(USER_S);
    assert.ok(rows.some((r) => r.id === "book-consumer-1"));
  });

  it("consumer S sees their own Org B booking (via parties-can-read)", () => {
    const rows = selectAll(USER_S);
    assert.ok(rows.some((r) => r.id === "book-B-1"));
  });

  it("consumer S does NOT see Org B's other booking", () => {
    const rows = selectAll(USER_S);
    assert.equal(rows.some((r) => r.id === "book-B-2"), false);
  });

  it("consumer S does NOT see Org A rows at all", () => {
    const rows = selectAll(USER_S);
    for (const r of rows) {
      assert.notEqual(r.organization_id, ORG_A);
    }
  });
});

describe("cross-org isolation — carer scope", () => {
  it("carer C sees only the booking they are assigned to", () => {
    const rows = selectAll(USER_C);
    assert.deepEqual(rows.map((r) => r.id), ["book-A-1"]);
  });

  it("carer C does NOT see other Org A bookings", () => {
    const rows = selectAll(USER_C);
    assert.equal(rows.some((r) => r.id === "book-A-2"), false);
  });
});

describe("non-member users see nothing outside their own bookings", () => {
  it("user with no memberships and no booking-party rows sees 0 rows", () => {
    const rows = selectAll("user-nobody");
    assert.deepEqual(rows, []);
  });

  it("filtering by Org A as a non-member returns 0 rows", () => {
    const rows = selectAll("user-nobody", ORG_A);
    assert.deepEqual(rows, []);
  });

  it("filtering by Org B as a non-member returns 0 rows", () => {
    const rows = selectAll("user-nobody", ORG_B);
    assert.deepEqual(rows, []);
  });
});

// ---------------------------------------------------------------------------
// Regression: the OLD `bookings_org_member_read` policy — the one
// dropped by the D3 migration — would have let a booker of B see Org
// A rows if they happened to be a viewer of A too. The new per-role
// policies still allow that (a user membered in multiple orgs sees
// both), which is CORRECT. The regression check is that a viewer of
// ONE org can't see the OTHER org's rows.
// ---------------------------------------------------------------------------

describe("regression — dropped policy behaviour is unchanged for same-org viewers", () => {
  it("viewer of A cannot inspect Org B via any org filter", () => {
    const rowsB = selectAll(USER_U, ORG_B);
    assert.deepEqual(rowsB, []);
    const rowsA = selectAll(USER_U, ORG_A);
    assert.equal(rowsA.length, 2);
  });

  it("multi-membership: user in both orgs sees rows from both", () => {
    memberships["user-M"] = [
      { orgId: ORG_A, role: "viewer" },
      { orgId: ORG_B, role: "finance" },
    ];
    try {
      const rows = selectAll("user-M");
      const orgs = new Set(rows.map((r) => r.organization_id));
      assert.ok(orgs.has(ORG_A));
      assert.ok(orgs.has(ORG_B));
    } finally {
      delete memberships["user-M"];
    }
  });
});

describe("policy applies to organization_id = null rows", () => {
  it("no org-role policy fires for a consumer (organization_id NULL) booking", () => {
    // Only the parties-can-read policy can grant a read on
    // organization_id NULL rows. USER_U (viewer of A) is not the
    // seeker or carer on book-consumer-1, so they don't see it.
    const rows = selectAll(USER_U);
    assert.equal(rows.some((r) => r.id === "book-consumer-1"), false);
  });
});
