/**
 * Tests for members.ts handlers (Phase D — PR D2).
 *
 * Covers:
 *   handleChangeRole    — owner protection, insufficient role, cross-org,
 *                         not-found, invalid role, invalid id,
 *                         unauthenticated, no-op same role, deploy-safe,
 *                         audit row assertion
 *   handleRemoveMember  — owner protection, last-admin protection,
 *                         self-removal without last-admin, cross-org,
 *                         insufficient role, deploy-safe, audit row
 *   handleListMembers   — cross-org isolation, PII scope, deploy-safe,
 *                         empty org, auth
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { OrgRole } from "./authz";
import {
  ASSIGNABLE_ROLES,
  handleChangeRole,
  handleListMembers,
  handleRemoveMember,
  isAssignableRole,
  type AuditRow,
  type MemberRow,
  type MembersDb,
  type PublicMember,
  type SchemaNotReady,
} from "./members";

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

type FakeState = {
  db: MembersDb;
  members: Map<string, MemberRow>;
  audit: AuditRow[];
  schemaReady: {
    members?: boolean;
    audit?: boolean;
  };
  auditFails?: boolean;
};

function makeFakeDb(): FakeState {
  const members = new Map<string, MemberRow>();
  const audit: AuditRow[] = [];
  const schemaReady: FakeState["schemaReady"] = {};
  const state: FakeState = {
    db: undefined as unknown as MembersDb,
    members,
    audit,
    schemaReady,
  };

  const notReady = (
    flag: boolean | undefined,
  ): SchemaNotReady | null => (flag === false ? { schemaNotReady: true } : null);

  state.db = {
    async findMemberById(id) {
      const nr = notReady(schemaReady.members);
      if (nr) return nr;
      const row = members.get(id);
      // Return a snapshot, not a live reference — matches real DB
      // behaviour so a later updateMemberRole() mutation doesn't
      // retroactively change the caller's `target`.
      return { ok: true, row: row ? { ...row } : null };
    },
    async findMyRole(userId, orgId) {
      const nr = notReady(schemaReady.members);
      if (nr) return nr;
      for (const m of members.values()) {
        if (m.organization_id === orgId && m.user_id === userId) {
          return { ok: true, role: m.role };
        }
      }
      return { ok: true, role: null };
    },
    async updateMemberRole({ id, role }) {
      const nr = notReady(schemaReady.members);
      if (nr) return nr;
      const row = members.get(id);
      if (!row) return { ok: true, updated: false };
      row.role = role;
      return { ok: true, updated: true };
    },
    async deleteMember({ id }) {
      const nr = notReady(schemaReady.members);
      if (nr) return nr;
      const existed = members.delete(id);
      return { ok: true, deleted: existed };
    },
    async listMembers(orgId) {
      const nr = notReady(schemaReady.members);
      if (nr) return nr;
      const rows: MemberRow[] = [];
      for (const m of members.values()) {
        if (m.organization_id === orgId) rows.push({ ...m });
      }
      return { ok: true, rows };
    },
    async countOrgAdmins(orgId) {
      const nr = notReady(schemaReady.members);
      if (nr) return nr;
      let n = 0;
      for (const m of members.values()) {
        if (
          m.organization_id === orgId &&
          (m.role === "owner" || m.role === "admin")
        ) {
          n++;
        }
      }
      return { ok: true, count: n };
    },
    async insertAudit(row) {
      if (state.auditFails) return { ok: false, error: "boom" };
      const nr = notReady(schemaReady.audit);
      if (nr) return { ok: true }; // deploy-safe: don't block writes
      audit.push({ ...row });
      return { ok: true };
    },
  };
  return state;
}

function mkMember(
  overrides: Partial<MemberRow> & { id: string; user_id: string; organization_id: string; role: OrgRole },
): MemberRow {
  return {
    id: overrides.id,
    user_id: overrides.user_id,
    organization_id: overrides.organization_id,
    role: overrides.role,
    full_name: overrides.full_name ?? "Test User",
    work_email: overrides.work_email ?? "user@example.com",
    is_signatory: overrides.is_signatory ?? false,
    created_at: overrides.created_at ?? "2026-09-13T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// isAssignableRole + ASSIGNABLE_ROLES
// ---------------------------------------------------------------------------

describe("isAssignableRole", () => {
  it("accepts admin, booker, finance, viewer", () => {
    for (const r of ASSIGNABLE_ROLES) {
      assert.equal(isAssignableRole(r), true);
    }
  });

  it("rejects owner (cannot be assigned via PATCH)", () => {
    assert.equal(isAssignableRole("owner"), false);
  });

  it("rejects unknown values", () => {
    assert.equal(isAssignableRole("root"), false);
    assert.equal(isAssignableRole(""), false);
    assert.equal(isAssignableRole(undefined), false);
    assert.equal(isAssignableRole(42), false);
  });
});

// ---------------------------------------------------------------------------
// handleChangeRole
// ---------------------------------------------------------------------------

describe("handleChangeRole — auth + validation", () => {
  it("401 on missing actor", async () => {
    const s = makeFakeDb();
    const r = await handleChangeRole(
      { actor: { id: "", email: null }, memberId: "m1", role: "admin" },
      { db: s.db },
    );
    assert.equal(r.status, 401);
  });

  it("400 on empty member id", async () => {
    const s = makeFakeDb();
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "", role: "admin" },
      { db: s.db },
    );
    assert.equal(r.status, 400);
    assert.equal((r.body as { error: string }).error, "invalid_id");
  });

  it("400 on invalid role value", async () => {
    const s = makeFakeDb();
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "m1", role: "root" },
      { db: s.db },
    );
    assert.equal(r.status, 400);
    assert.equal((r.body as { error: string }).error, "invalid_role");
  });

  it("400 when trying to assign owner via PATCH", async () => {
    const s = makeFakeDb();
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "m1", role: "owner" },
      { db: s.db },
    );
    assert.equal(r.status, 400);
    assert.equal((r.body as { error: string }).error, "invalid_role");
  });
});

describe("handleChangeRole — not-found + cross-org", () => {
  it("404 when member id doesn't exist", async () => {
    const s = makeFakeDb();
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "nope", role: "booker" },
      { db: s.db },
    );
    assert.equal(r.status, 404);
  });

  it("403 not_a_member when actor is not in target's org", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m1",
      mkMember({ id: "m1", user_id: "u2", organization_id: "org1", role: "viewer" }),
    );
    // u1 is not a member of org1.
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "m1", role: "booker" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "not_a_member");
  });

  it("403 insufficient_role when actor is booker on org", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m1",
      mkMember({ id: "m1", user_id: "u2", organization_id: "org1", role: "viewer" }),
    );
    s.members.set(
      "m2",
      mkMember({ id: "m2", user_id: "u1", organization_id: "org1", role: "booker" }),
    );
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "m1", role: "booker" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "insufficient_role");
  });
});

describe("handleChangeRole — owner protection", () => {
  it("403 cannot_modify_owner when admin tries to change owner", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-owner",
      mkMember({ id: "m-owner", user_id: "u-owner", organization_id: "org1", role: "owner" }),
    );
    s.members.set(
      "m-admin",
      mkMember({ id: "m-admin", user_id: "u-admin", organization_id: "org1", role: "admin" }),
    );
    const r = await handleChangeRole(
      { actor: { id: "u-admin", email: null }, memberId: "m-owner", role: "viewer" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "cannot_modify_owner");
  });

  it("403 cannot_modify_owner when owner tries to change themselves", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-owner",
      mkMember({ id: "m-owner", user_id: "u-owner", organization_id: "org1", role: "owner" }),
    );
    const r = await handleChangeRole(
      { actor: { id: "u-owner", email: null }, memberId: "m-owner", role: "admin" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
  });
});

describe("handleChangeRole — happy path + audit", () => {
  it("200 changes role and inserts audit row (admin promoting viewer→booker)", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org1", role: "viewer" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    const r = await handleChangeRole(
      { actor: { id: "u-actor", email: "a@x" }, memberId: "m-target", role: "booker" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    const body = r.body as { ok: true; from_role: OrgRole; to_role: OrgRole };
    assert.equal(body.from_role, "viewer");
    assert.equal(body.to_role, "booker");
    assert.equal(s.members.get("m-target")!.role, "booker");
    assert.equal(s.audit.length, 1);
    assert.deepEqual(s.audit[0], {
      organization_id: "org1",
      actor_user_id: "u-actor",
      target_user_id: "u-target",
      action: "role_changed",
      from_role: "viewer",
      to_role: "booker",
      metadata: null,
    });
  });

  it("200 no-op when role is unchanged; no audit row", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org1", role: "booker" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    const r = await handleChangeRole(
      { actor: { id: "u-actor", email: null }, memberId: "m-target", role: "booker" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    assert.equal(s.audit.length, 0);
  });

  it("200 owner can change an admin's role", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org1", role: "admin" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "owner" }),
    );
    const r = await handleChangeRole(
      { actor: { id: "u-actor", email: null }, memberId: "m-target", role: "finance" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    assert.equal(s.members.get("m-target")!.role, "finance");
    assert.equal(s.audit[0].to_role, "finance");
  });

  it("mutation still succeeds when audit insert fails (best-effort)", async () => {
    const s = makeFakeDb();
    s.auditFails = true;
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org1", role: "viewer" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const r = await handleChangeRole(
        { actor: { id: "u-actor", email: null }, memberId: "m-target", role: "booker" },
        { db: s.db },
      );
      assert.equal(r.status, 200);
      assert.equal(s.members.get("m-target")!.role, "booker");
    } finally {
      console.warn = origWarn;
    }
  });
});

describe("handleChangeRole — deploy-safe", () => {
  it("202 schema_not_ready when member table missing", async () => {
    const s = makeFakeDb();
    s.schemaReady.members = false;
    const r = await handleChangeRole(
      { actor: { id: "u1", email: null }, memberId: "m1", role: "booker" },
      { db: s.db },
    );
    assert.equal(r.status, 202);
    assert.equal((r.body as { skippedReason: string }).skippedReason, "schema_not_ready");
  });
});

// ---------------------------------------------------------------------------
// handleRemoveMember
// ---------------------------------------------------------------------------

describe("handleRemoveMember — auth + validation", () => {
  it("401 on missing actor", async () => {
    const s = makeFakeDb();
    const r = await handleRemoveMember(
      { actor: { id: "", email: null }, memberId: "m1" },
      { db: s.db },
    );
    assert.equal(r.status, 401);
  });

  it("400 on empty id", async () => {
    const s = makeFakeDb();
    const r = await handleRemoveMember(
      { actor: { id: "u1", email: null }, memberId: "" },
      { db: s.db },
    );
    assert.equal(r.status, 400);
  });

  it("404 when member doesn't exist", async () => {
    const s = makeFakeDb();
    const r = await handleRemoveMember(
      { actor: { id: "u1", email: null }, memberId: "nope" },
      { db: s.db },
    );
    assert.equal(r.status, 404);
  });
});

describe("handleRemoveMember — owner protection", () => {
  it("403 cannot_modify_owner when removing owner", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-owner",
      mkMember({ id: "m-owner", user_id: "u-owner", organization_id: "org1", role: "owner" }),
    );
    s.members.set(
      "m-admin",
      mkMember({ id: "m-admin", user_id: "u-admin", organization_id: "org1", role: "admin" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-admin", email: null }, memberId: "m-owner" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "cannot_modify_owner");
  });
});

describe("handleRemoveMember — last-admin protection", () => {
  it("403 last_admin when self-removing and only 1 admin remains", async () => {
    const s = makeFakeDb();
    // No owner, one admin (the actor) — self-remove would orphan the org.
    s.members.set(
      "m-admin",
      mkMember({ id: "m-admin", user_id: "u-admin", organization_id: "org1", role: "admin" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-admin", email: null }, memberId: "m-admin" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "last_admin");
  });

  it("200 self-remove when another admin exists", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    s.members.set(
      "m-other",
      mkMember({ id: "m-other", user_id: "u-other", organization_id: "org1", role: "admin" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-actor", email: null }, memberId: "m-actor" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    assert.equal(s.members.has("m-actor"), false);
    assert.equal(s.audit[0].action, "removed");
    assert.equal(s.audit[0].from_role, "admin");
    assert.equal(s.audit[0].to_role, null);
  });

  it("200 self-remove when owner remains (owner counts as admin)", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-owner",
      mkMember({ id: "m-owner", user_id: "u-owner", organization_id: "org1", role: "owner" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-actor", email: null }, memberId: "m-actor" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
  });
});

describe("handleRemoveMember — happy path + audit", () => {
  it("200 removes a viewer and inserts audit row", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org1", role: "viewer" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-actor", email: null }, memberId: "m-target" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    assert.equal(s.members.has("m-target"), false);
    assert.equal(s.audit.length, 1);
    assert.equal(s.audit[0].action, "removed");
    assert.equal(s.audit[0].target_user_id, "u-target");
    assert.equal(s.audit[0].from_role, "viewer");
    assert.equal(s.audit[0].to_role, null);
  });

  it("403 insufficient_role when actor is booker", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org1", role: "viewer" }),
    );
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "booker" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-actor", email: null }, memberId: "m-target" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "insufficient_role");
  });

  it("403 not_a_member cross-org", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-target",
      mkMember({ id: "m-target", user_id: "u-target", organization_id: "org2", role: "viewer" }),
    );
    // u-actor is admin on org1, target is in org2.
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    const r = await handleRemoveMember(
      { actor: { id: "u-actor", email: null }, memberId: "m-target" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "not_a_member");
  });
});

describe("handleRemoveMember — deploy-safe", () => {
  it("202 schema_not_ready when member table missing", async () => {
    const s = makeFakeDb();
    s.schemaReady.members = false;
    const r = await handleRemoveMember(
      { actor: { id: "u1", email: null }, memberId: "m1" },
      { db: s.db },
    );
    assert.equal(r.status, 202);
  });
});

// ---------------------------------------------------------------------------
// handleListMembers
// ---------------------------------------------------------------------------

describe("handleListMembers — auth + validation", () => {
  it("401 on missing actor", async () => {
    const s = makeFakeDb();
    const r = await handleListMembers(
      { actor: { id: "", email: null }, organizationId: "org1" },
      { db: s.db },
    );
    assert.equal(r.status, 401);
  });

  it("400 on empty organization id", async () => {
    const s = makeFakeDb();
    const r = await handleListMembers(
      { actor: { id: "u1", email: null }, organizationId: "" },
      { db: s.db },
    );
    assert.equal(r.status, 400);
  });
});

describe("handleListMembers — cross-org isolation", () => {
  it("403 not_a_member when actor doesn't belong to the org", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m1",
      mkMember({ id: "m1", user_id: "u-other", organization_id: "org1", role: "viewer" }),
    );
    const r = await handleListMembers(
      { actor: { id: "u1", email: null }, organizationId: "org1" },
      { db: s.db },
    );
    assert.equal(r.status, 403);
    assert.equal((r.body as { error: string }).error, "not_a_member");
  });
});

describe("handleListMembers — happy path + PII scope", () => {
  it("200 returns members with public fields only", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "viewer" }),
    );
    s.members.set(
      "m-other",
      mkMember({
        id: "m-other",
        user_id: "u-other",
        organization_id: "org1",
        role: "admin",
        full_name: "Ada",
        work_email: "ada@x.com",
        is_signatory: true,
      }),
    );
    const r = await handleListMembers(
      { actor: { id: "u-actor", email: null }, organizationId: "org1" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    const body = r.body as { ok: true; members: PublicMember[] };
    assert.equal(body.members.length, 2);
    for (const m of body.members) {
      // Scope check: only whitelisted fields present. If a future
      // MembersDb returned extra columns, they'd need to be added
      // here deliberately.
      const keys = Object.keys(m).sort();
      assert.deepEqual(keys, [
        "created_at",
        "full_name",
        "is_signatory",
        "role",
        "user_id",
        "work_email",
        "id",
      ].sort());
    }
    const ada = body.members.find((m) => m.user_id === "u-other")!;
    assert.equal(ada.full_name, "Ada");
    assert.equal(ada.work_email, "ada@x.com");
    assert.equal(ada.is_signatory, true);
    assert.equal(ada.role, "admin");
  });

  it("200 empty list is allowed when actor is a viewer with no peers", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "viewer" }),
    );
    const r = await handleListMembers(
      { actor: { id: "u-actor", email: null }, organizationId: "org1" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    const body = r.body as { ok: true; members: PublicMember[] };
    assert.equal(body.members.length, 1);
    assert.equal(body.members[0].user_id, "u-actor");
  });

  it("200 does not leak other-org members", async () => {
    const s = makeFakeDb();
    s.members.set(
      "m-actor",
      mkMember({ id: "m-actor", user_id: "u-actor", organization_id: "org1", role: "admin" }),
    );
    s.members.set(
      "m-other",
      mkMember({ id: "m-other", user_id: "u-other", organization_id: "org2", role: "admin" }),
    );
    const r = await handleListMembers(
      { actor: { id: "u-actor", email: null }, organizationId: "org1" },
      { db: s.db },
    );
    assert.equal(r.status, 200);
    const body = r.body as { ok: true; members: PublicMember[] };
    assert.equal(body.members.length, 1);
    assert.equal(body.members[0].user_id, "u-actor");
  });
});

describe("handleListMembers — deploy-safe", () => {
  it("202 schema_not_ready when member table missing", async () => {
    const s = makeFakeDb();
    s.schemaReady.members = false;
    const r = await handleListMembers(
      { actor: { id: "u1", email: null }, organizationId: "org1" },
      { db: s.db },
    );
    assert.equal(r.status, 202);
  });
});
