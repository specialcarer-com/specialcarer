/**
 * Tests for booking-authz.ts (Phase D — PR D3).
 *
 * Coverage:
 *   • requireBookerRole — owner/admin/booker allowed; finance/viewer
 *     rejected with insufficient_role; missing membership rejected
 *     with not_a_member; PG 42P01/42703 → schema_not_ready; unknown
 *     role handled defensively; generic DB errors mapped to
 *     not_a_member; membership resolution returns memberId + fullName
 *     for the RPC snapshot.
 *   • getBookingVisibilityScope — admin/booker/finance/viewer paths;
 *     non-org booking → 'none'; caller-not-member → 'none';
 *     unknown role → 'none'; schema not ready → 'none';
 *     booking-not-found → 'none'.
 *   • redactForViewer / applyProjectionForScope — financial columns
 *     nulled; shape preserved; no-op for admin/booker/finance/none;
 *     unrelated columns untouched.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyProjectionForScope,
  getBookingVisibilityScope,
  redactForViewer,
  requireBookerRole,
  VIEWER_HIDDEN_BOOKING_FIELDS,
} from "./booking-authz";

// ---------------------------------------------------------------------------
// Fake Supabase client
// ---------------------------------------------------------------------------

type MemberRow = { id: string; role: string; full_name: string | null } | null;
type BookingRow = { organization_id: string | null } | null;

type Scenario = {
  kind: "row";
  member?: MemberRow;
  booking?: BookingRow;
} | {
  kind: "error";
  table: "organization_members" | "bookings";
  code: string;
};

function makeClient(scen: Scenario) {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_c: string, _v: string) {
              return this;
            },
            maybeSingle<T>() {
              if (scen.kind === "error" && scen.table === table) {
                return Promise.resolve({
                  data: null as T | null,
                  error: { code: scen.code, message: "err" },
                });
              }
              if (table === "organization_members") {
                return Promise.resolve({
                  data: (scen.kind === "row"
                    ? (scen.member as unknown as T)
                    : null) ?? null,
                  error: null,
                });
              }
              if (table === "bookings") {
                return Promise.resolve({
                  data: (scen.kind === "row"
                    ? (scen.booking as unknown as T)
                    : null) ?? null,
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          } as unknown as {
            eq: (c: string, v: string) => unknown;
            maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const USER = "user-1";
const ORG = "org-1";
const BOOKING = "book-1";

// ---------------------------------------------------------------------------
// requireBookerRole — role gating
// ---------------------------------------------------------------------------

describe("requireBookerRole — allowed roles", () => {
  for (const role of ["owner", "admin", "booker"] as const) {
    it(`allows ${role}`, async () => {
      const client = makeClient({
        kind: "row",
        member: { id: "m-1", role, full_name: "Test Name" },
      });
      const res = await requireBookerRole(client, USER, ORG);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.role, role);
        assert.equal(res.memberId, "m-1");
        assert.equal(res.fullName, "Test Name");
      }
    });
  }
});

describe("requireBookerRole — rejected roles", () => {
  for (const role of ["finance", "viewer"] as const) {
    it(`rejects ${role} with insufficient_role`, async () => {
      const client = makeClient({
        kind: "row",
        member: { id: "m-1", role, full_name: null },
      });
      const res = await requireBookerRole(client, USER, ORG);
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.error, "insufficient_role");
    });
  }
});

describe("requireBookerRole — missing membership", () => {
  it("returns not_a_member when no row is found", async () => {
    const client = makeClient({ kind: "row", member: null });
    const res = await requireBookerRole(client, USER, ORG);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "not_a_member");
  });
});

describe("requireBookerRole — deploy-safe fallback", () => {
  it("returns schema_not_ready on 42P01 (undefined_table)", async () => {
    const client = makeClient({
      kind: "error",
      table: "organization_members",
      code: "42P01",
    });
    const res = await requireBookerRole(client, USER, ORG);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "schema_not_ready");
  });

  it("returns schema_not_ready on 42703 (undefined_column)", async () => {
    const client = makeClient({
      kind: "error",
      table: "organization_members",
      code: "42703",
    });
    const res = await requireBookerRole(client, USER, ORG);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "schema_not_ready");
  });

  it("maps generic DB errors to not_a_member (fail-closed)", async () => {
    const client = makeClient({
      kind: "error",
      table: "organization_members",
      code: "08006",
    });
    const res = await requireBookerRole(client, USER, ORG);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "not_a_member");
  });
});

describe("requireBookerRole — defensive role parsing", () => {
  it("rejects unknown role strings as not_a_member", async () => {
    const client = makeClient({
      kind: "row",
      member: { id: "m-1", role: "root", full_name: null },
    });
    const res = await requireBookerRole(client, USER, ORG);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "not_a_member");
  });

  it("rejects empty-string roles as not_a_member", async () => {
    const client = makeClient({
      kind: "row",
      member: { id: "m-1", role: "", full_name: null },
    });
    const res = await requireBookerRole(client, USER, ORG);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, "not_a_member");
  });
});

describe("requireBookerRole — snapshot fields", () => {
  it("returns fullName from the organization_members row", async () => {
    const client = makeClient({
      kind: "row",
      member: { id: "m-42", role: "booker", full_name: "Sarah Booker" },
    });
    const res = await requireBookerRole(client, USER, ORG);
    if (res.ok) {
      assert.equal(res.memberId, "m-42");
      assert.equal(res.fullName, "Sarah Booker");
    } else {
      assert.fail("expected ok");
    }
  });

  it("tolerates null full_name", async () => {
    const client = makeClient({
      kind: "row",
      member: { id: "m-42", role: "admin", full_name: null },
    });
    const res = await requireBookerRole(client, USER, ORG);
    if (res.ok) assert.equal(res.fullName, null);
  });
});

// ---------------------------------------------------------------------------
// getBookingVisibilityScope
// ---------------------------------------------------------------------------

describe("getBookingVisibilityScope — role → scope mapping", () => {
  const cases: Array<[string, "admin" | "booker" | "finance" | "viewer"]> = [
    ["owner", "admin"],
    ["admin", "admin"],
    ["booker", "booker"],
    ["finance", "finance"],
    ["viewer", "viewer"],
  ];
  for (const [role, expected] of cases) {
    it(`${role} → ${expected}`, async () => {
      const client = makeClient({
        kind: "row",
        booking: { organization_id: ORG },
        member: { id: "m-1", role, full_name: null },
      });
      const s = await getBookingVisibilityScope(client, USER, BOOKING);
      assert.equal(s, expected);
    });
  }
});

describe("getBookingVisibilityScope — 'none' paths", () => {
  it("returns 'none' when the booking has no organization_id", async () => {
    const client = makeClient({
      kind: "row",
      booking: { organization_id: null },
      member: { id: "m-1", role: "owner", full_name: null },
    });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });

  it("returns 'none' when booking not found", async () => {
    const client = makeClient({
      kind: "row",
      booking: null,
      member: { id: "m-1", role: "owner", full_name: null },
    });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });

  it("returns 'none' when caller is not a member of the org", async () => {
    const client = makeClient({
      kind: "row",
      booking: { organization_id: ORG },
      member: null,
    });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });

  it("returns 'none' for unknown role", async () => {
    const client = makeClient({
      kind: "row",
      booking: { organization_id: ORG },
      member: { id: "m-1", role: "root", full_name: null },
    });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });

  it("returns 'none' on bookings schema_not_ready (42P01)", async () => {
    const client = makeClient({
      kind: "error",
      table: "bookings",
      code: "42P01",
    });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });

  it("returns 'none' on members schema_not_ready (42703)", async () => {
    const client = makeClient({
      kind: "error",
      table: "organization_members",
      code: "42703",
    });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });

  it("returns 'none' on generic DB error on bookings", async () => {
    const client = makeClient({ kind: "error", table: "bookings", code: "08006" });
    const s = await getBookingVisibilityScope(client, USER, BOOKING);
    assert.equal(s, "none");
  });
});

// ---------------------------------------------------------------------------
// redactForViewer + applyProjectionForScope
// ---------------------------------------------------------------------------

const SAMPLE_ROW = {
  id: "b-1",
  organization_id: "o-1",
  status: "offered",
  starts_at: "2026-10-01T10:00:00Z",
  ends_at: "2026-10-01T14:00:00Z",
  hours: 4,
  hourly_rate_cents: 3000,
  subtotal_cents: 12000,
  total_cents: 12000,
  platform_fee_cents: 3000,
  org_charge_total_cents: 12000,
  carer_pay_total_cents: 9000,
  stripe_invoice_id: "in_test_1",
  service_type: "care_services",
  notes: "hi",
};

describe("redactForViewer", () => {
  it("nulls every field in VIEWER_HIDDEN_BOOKING_FIELDS", () => {
    const out = redactForViewer(SAMPLE_ROW);
    for (const k of VIEWER_HIDDEN_BOOKING_FIELDS) {
      assert.equal(out[k as keyof typeof out], null, `${k} should be null`);
    }
  });

  it("leaves non-financial fields intact", () => {
    const out = redactForViewer(SAMPLE_ROW);
    assert.equal(out.id, "b-1");
    assert.equal(out.status, "offered");
    assert.equal(out.hours, 4);
    assert.equal(out.notes, "hi");
    assert.equal(out.service_type, "care_services");
  });

  it("does not mutate the input row", () => {
    const input = { ...SAMPLE_ROW };
    redactForViewer(input);
    assert.equal(input.hourly_rate_cents, 3000);
    assert.equal(input.total_cents, 12000);
  });

  it("skips fields that aren't present on the row", () => {
    const partial = { id: "b-1", status: "offered" } as Record<string, unknown>;
    const out = redactForViewer(partial);
    // Never adds the field — the caller may be doing a narrower SELECT.
    assert.equal("hourly_rate_cents" in out, false);
    assert.equal(out.id, "b-1");
  });
});

describe("applyProjectionForScope", () => {
  it("redacts for viewer", () => {
    const out = applyProjectionForScope(SAMPLE_ROW, "viewer");
    assert.equal(out.hourly_rate_cents, null);
  });

  for (const scope of ["admin", "booker", "finance", "none"] as const) {
    it(`is a no-op for ${scope}`, () => {
      const out = applyProjectionForScope(SAMPLE_ROW, scope);
      assert.equal(out.hourly_rate_cents, 3000);
      assert.equal(out.carer_pay_total_cents, 9000);
    });
  }

  it("preserves reference identity for non-viewer scopes", () => {
    const out = applyProjectionForScope(SAMPLE_ROW, "admin");
    assert.equal(out, SAMPLE_ROW);
  });
});

describe("VIEWER_HIDDEN_BOOKING_FIELDS contract", () => {
  it("is a non-empty frozen list", () => {
    assert.equal(Object.isFrozen(VIEWER_HIDDEN_BOOKING_FIELDS), true);
    assert.ok(VIEWER_HIDDEN_BOOKING_FIELDS.length > 0);
  });

  it("includes every financial column the plan expects", () => {
    const expected = [
      "hourly_rate_cents",
      "subtotal_cents",
      "total_cents",
      "platform_fee_cents",
      "org_charge_total_cents",
      "carer_pay_total_cents",
      "stripe_invoice_id",
    ];
    for (const k of expected) {
      assert.ok(
        VIEWER_HIDDEN_BOOKING_FIELDS.includes(k),
        `${k} missing from hidden set`,
      );
    }
  });
});
