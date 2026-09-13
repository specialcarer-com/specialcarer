/**
 * Tests for authz.ts (Phase D — PR D2).
 *
 * Three surfaces:
 *   1. roleAtLeast — the pure hierarchy predicate (booker + finance
 *      are parallel siblings, both above viewer, both below admin).
 *   2. canModifyMember — owner-protection guardrail used by the PATCH
 *      + DELETE endpoints before they mutate the members table.
 *   3. requireOrgRole — the DB helper: happy path, insufficient role,
 *      not a member, schema_not_ready fallback, and defensive
 *      unknown-role handling.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canModifyMember,
  isOrgRole,
  ORG_ROLES,
  requireOrgRole,
  roleAtLeast,
  type OrgRole,
} from "./authz";

// ---------------------------------------------------------------------------
// Fake Supabase client for requireOrgRole
// ---------------------------------------------------------------------------

type FakeRow = { role: string } | null;

function makeFakeClient(
  behaviour:
    | { kind: "row"; row: FakeRow }
    | { kind: "error"; code: string; message?: string },
) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_c: string, _v: string) {
              return this;
            },
            maybeSingle<T>() {
              if (behaviour.kind === "error") {
                return Promise.resolve({
                  data: null as T | null,
                  error: {
                    code: behaviour.code,
                    message: behaviour.message ?? "err",
                  },
                });
              }
              return Promise.resolve({
                data: (behaviour.row as unknown as T) ?? null,
                error: null,
              });
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

// ---------------------------------------------------------------------------
// isOrgRole
// ---------------------------------------------------------------------------

describe("isOrgRole", () => {
  it("accepts every canonical role", () => {
    for (const r of ORG_ROLES) {
      assert.equal(isOrgRole(r), true, `expected ${r} to be a role`);
    }
  });

  it("rejects unknown strings", () => {
    assert.equal(isOrgRole("root"), false);
    assert.equal(isOrgRole("Owner"), false); // case-sensitive
    assert.equal(isOrgRole(""), false);
  });

  it("rejects non-strings", () => {
    assert.equal(isOrgRole(undefined), false);
    assert.equal(isOrgRole(null), false);
    assert.equal(isOrgRole(42), false);
    assert.equal(isOrgRole({ role: "owner" }), false);
  });
});

// ---------------------------------------------------------------------------
// roleAtLeast — reflexive
// ---------------------------------------------------------------------------

describe("roleAtLeast — reflexive", () => {
  for (const r of ORG_ROLES) {
    it(`${r} is at least ${r} (self)`, () => {
      assert.equal(roleAtLeast(r, r), true);
    });
  }
});

// ---------------------------------------------------------------------------
// roleAtLeast — owner dominates everyone
// ---------------------------------------------------------------------------

describe("roleAtLeast — owner dominates", () => {
  for (const r of ORG_ROLES) {
    it(`owner is at least ${r}`, () => {
      assert.equal(roleAtLeast("owner", r), true);
    });
  }
});

// ---------------------------------------------------------------------------
// roleAtLeast — admin dominates non-owner
// ---------------------------------------------------------------------------

describe("roleAtLeast — admin dominates non-owner", () => {
  it("admin is at least admin", () => {
    assert.equal(roleAtLeast("admin", "admin"), true);
  });
  it("admin is at least booker", () => {
    assert.equal(roleAtLeast("admin", "booker"), true);
  });
  it("admin is at least finance", () => {
    assert.equal(roleAtLeast("admin", "finance"), true);
  });
  it("admin is at least viewer", () => {
    assert.equal(roleAtLeast("admin", "viewer"), true);
  });
  it("admin is NOT at least owner", () => {
    assert.equal(roleAtLeast("admin", "owner"), false);
  });
});

// ---------------------------------------------------------------------------
// roleAtLeast — booker + finance are parallel siblings
// ---------------------------------------------------------------------------

describe("roleAtLeast — booker & finance are parallel siblings", () => {
  it("booker is NOT at least finance", () => {
    assert.equal(roleAtLeast("booker", "finance"), false);
  });
  it("finance is NOT at least booker", () => {
    assert.equal(roleAtLeast("finance", "booker"), false);
  });
  it("booker is at least viewer", () => {
    assert.equal(roleAtLeast("booker", "viewer"), true);
  });
  it("finance is at least viewer", () => {
    assert.equal(roleAtLeast("finance", "viewer"), true);
  });
  it("booker is NOT at least admin", () => {
    assert.equal(roleAtLeast("booker", "admin"), false);
  });
  it("finance is NOT at least admin", () => {
    assert.equal(roleAtLeast("finance", "admin"), false);
  });
});

// ---------------------------------------------------------------------------
// roleAtLeast — viewer is the floor
// ---------------------------------------------------------------------------

describe("roleAtLeast — viewer is the floor", () => {
  it("viewer is at least viewer", () => {
    assert.equal(roleAtLeast("viewer", "viewer"), true);
  });
  it("viewer is NOT at least booker", () => {
    assert.equal(roleAtLeast("viewer", "booker"), false);
  });
  it("viewer is NOT at least finance", () => {
    assert.equal(roleAtLeast("viewer", "finance"), false);
  });
  it("viewer is NOT at least admin", () => {
    assert.equal(roleAtLeast("viewer", "admin"), false);
  });
  it("viewer is NOT at least owner", () => {
    assert.equal(roleAtLeast("viewer", "owner"), false);
  });
});

// ---------------------------------------------------------------------------
// canModifyMember
// ---------------------------------------------------------------------------

describe("canModifyMember — owner protection", () => {
  it("owner cannot be role-changed by an admin", () => {
    assert.equal(canModifyMember("admin", "owner", "change_role"), false);
  });
  it("owner cannot be removed by an admin", () => {
    assert.equal(canModifyMember("admin", "owner", "remove"), false);
  });
  it("owner cannot even change their own role via this helper", () => {
    // Owner-transfer is a later PR — D2 blocks it at this helper.
    assert.equal(canModifyMember("owner", "owner", "change_role"), false);
  });
  it("owner cannot remove themselves via this helper", () => {
    assert.equal(canModifyMember("owner", "owner", "remove"), false);
  });
});

describe("canModifyMember — actor must be admin+", () => {
  it("booker cannot change a viewer", () => {
    assert.equal(canModifyMember("booker", "viewer", "change_role"), false);
  });
  it("finance cannot change a viewer", () => {
    assert.equal(canModifyMember("finance", "viewer", "change_role"), false);
  });
  it("viewer cannot change anyone", () => {
    assert.equal(canModifyMember("viewer", "booker", "change_role"), false);
    assert.equal(canModifyMember("viewer", "finance", "remove"), false);
  });
  it("booker cannot remove a finance user", () => {
    assert.equal(canModifyMember("booker", "finance", "remove"), false);
  });
});

describe("canModifyMember — admin+ can modify non-owner", () => {
  it("owner can change an admin's role", () => {
    assert.equal(canModifyMember("owner", "admin", "change_role"), true);
  });
  it("owner can remove an admin", () => {
    assert.equal(canModifyMember("owner", "admin", "remove"), true);
  });
  it("admin can change another admin", () => {
    assert.equal(canModifyMember("admin", "admin", "change_role"), true);
  });
  it("admin can change a booker", () => {
    assert.equal(canModifyMember("admin", "booker", "change_role"), true);
  });
  it("admin can change a finance user", () => {
    assert.equal(canModifyMember("admin", "finance", "change_role"), true);
  });
  it("admin can change a viewer", () => {
    assert.equal(canModifyMember("admin", "viewer", "change_role"), true);
  });
  it("admin can remove a booker", () => {
    assert.equal(canModifyMember("admin", "booker", "remove"), true);
  });
});

// ---------------------------------------------------------------------------
// requireOrgRole
// ---------------------------------------------------------------------------

describe("requireOrgRole — happy paths", () => {
  it("owner satisfies admin requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "owner" } });
    const res = await requireOrgRole(admin, "u1", "org1", "admin");
    assert.deepEqual(res, { ok: true, role: "owner" });
  });

  it("admin satisfies admin requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "admin" } });
    const res = await requireOrgRole(admin, "u1", "org1", "admin");
    assert.deepEqual(res, { ok: true, role: "admin" });
  });

  it("booker satisfies viewer requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "booker" } });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: true, role: "booker" });
  });

  it("finance satisfies viewer requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "finance" } });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: true, role: "finance" });
  });

  it("viewer satisfies viewer requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "viewer" } });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: true, role: "viewer" });
  });
});

describe("requireOrgRole — insufficient_role", () => {
  it("booker fails admin requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "booker" } });
    const res = await requireOrgRole(admin, "u1", "org1", "admin");
    assert.deepEqual(res, { ok: false, error: "insufficient_role" });
  });

  it("viewer fails booker requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "viewer" } });
    const res = await requireOrgRole(admin, "u1", "org1", "booker");
    assert.deepEqual(res, { ok: false, error: "insufficient_role" });
  });

  it("booker fails finance requirement (parallel siblings)", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "booker" } });
    const res = await requireOrgRole(admin, "u1", "org1", "finance");
    assert.deepEqual(res, { ok: false, error: "insufficient_role" });
  });

  it("finance fails booker requirement (parallel siblings)", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "finance" } });
    const res = await requireOrgRole(admin, "u1", "org1", "booker");
    assert.deepEqual(res, { ok: false, error: "insufficient_role" });
  });

  it("admin fails owner requirement", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "admin" } });
    const res = await requireOrgRole(admin, "u1", "org1", "owner");
    assert.deepEqual(res, { ok: false, error: "insufficient_role" });
  });
});

describe("requireOrgRole — not_a_member", () => {
  it("returns not_a_member when no row exists", async () => {
    const admin = makeFakeClient({ kind: "row", row: null });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: false, error: "not_a_member" });
  });

  it("returns not_a_member when role field is missing", async () => {
    const admin = makeFakeClient({
      kind: "row",
      row: { role: "" } as unknown as { role: string },
    });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    // Empty string is not a valid OrgRole so we treat it as not_a_member.
    assert.deepEqual(res, { ok: false, error: "not_a_member" });
  });

  it("returns not_a_member for unknown role values (defensive)", async () => {
    const admin = makeFakeClient({ kind: "row", row: { role: "root" } });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: false, error: "not_a_member" });
  });

  it("returns not_a_member on unexpected DB error", async () => {
    const admin = makeFakeClient({ kind: "error", code: "XXXXX" });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: false, error: "not_a_member" });
  });
});

describe("requireOrgRole — schema_not_ready", () => {
  it("translates 42P01 (undefined_table) to schema_not_ready", async () => {
    const admin = makeFakeClient({ kind: "error", code: "42P01" });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: false, error: "schema_not_ready" });
  });

  it("translates 42703 (undefined_column) to schema_not_ready", async () => {
    const admin = makeFakeClient({ kind: "error", code: "42703" });
    const res = await requireOrgRole(admin, "u1", "org1", "viewer");
    assert.deepEqual(res, { ok: false, error: "schema_not_ready" });
  });
});

describe("ORG_ROLES", () => {
  it("has exactly 5 canonical roles", () => {
    assert.equal(ORG_ROLES.length, 5);
    const set = new Set<OrgRole>(ORG_ROLES);
    assert.equal(set.size, 5);
  });

  it("includes owner, admin, booker, finance, viewer", () => {
    assert.deepEqual(
      [...ORG_ROLES].sort(),
      ["admin", "booker", "finance", "owner", "viewer"],
    );
  });
});
