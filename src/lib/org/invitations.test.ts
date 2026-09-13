/**
 * Tests for invitations.ts handlers (Phase D — PR D1).
 *
 * Covers all four routes + cron with an in-memory fake DB. The four
 * critical behaviours per route:
 *
 *   send:    auth, admin gate, rate-limit, dedupe, email send, deploy-safe
 *   preview: token invalid, not found, cancelled 409, expired 410, ok 200
 *   accept:  auth, expired, cancelled, already-accepted, email mismatch,
 *            already-member, role_pending_d2, ok 200
 *   cancel:  auth, not-found, admin gate, already-accepted, ok 200
 *   cron:    happy, deploy-safe
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildAcceptUrl,
  handleAccept,
  handleCancel,
  handleExpireCron,
  handlePreview,
  handleSend,
  type InvitationRow,
  type InvitationsDb,
  type InvitationsDeps,
  type SchemaNotReady,
} from "./invitations";
import { hashToken } from "./invitation-token";

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

type FakeState = {
  db: InvitationsDb;
  invitations: Map<string, InvitationRow>;
  members: Map<string, { organization_id: string; user_id: string; role: string; email: string | null }>;
  orgAdmins: Map<string, Set<string>>; // orgId → set of user ids that are admin/owner
  orgNames: Map<string, string>;
  inviterNames: Map<string, string>;
  schemaReady: {
    admin?: boolean;
    member?: boolean;
    invitation?: boolean;
    accept?: boolean;
  };
};

function makeFakeDb(): FakeState {
  const invitations = new Map<string, InvitationRow>();
  const members = new Map<string, { organization_id: string; user_id: string; role: string; email: string | null }>();
  const orgAdmins = new Map<string, Set<string>>();
  const orgNames = new Map<string, string>();
  const inviterNames = new Map<string, string>();
  const schemaReady: FakeState["schemaReady"] = {};

  const memberKey = (org: string, user: string) => `${org}::${user}`;
  const schemaNotReadyIf = (
    flag: boolean | undefined,
  ): SchemaNotReady | null =>
    flag === false ? { schemaNotReady: true } : null;

  const db: InvitationsDb = {
    async isOrgAdmin(actorId, orgId) {
      const nr = schemaNotReadyIf(schemaReady.admin);
      if (nr) return nr;
      const admins = orgAdmins.get(orgId) ?? new Set();
      return { ok: true, admin: admins.has(actorId) };
    },
    async memberExists(orgId, userId) {
      const nr = schemaNotReadyIf(schemaReady.member);
      if (nr) return nr;
      return { ok: true, exists: members.has(memberKey(orgId, userId)) };
    },
    async memberExistsByEmail(orgId, emailLower) {
      const nr = schemaNotReadyIf(schemaReady.member);
      if (nr) return nr;
      for (const m of members.values()) {
        if (
          m.organization_id === orgId &&
          (m.email ?? "").toLowerCase() === emailLower
        ) {
          return { ok: true, exists: true };
        }
      }
      return { ok: true, exists: false };
    },
    async pendingInviteExists(orgId, emailLower) {
      const nr = schemaNotReadyIf(schemaReady.invitation);
      if (nr) return nr;
      for (const r of invitations.values()) {
        if (
          r.organization_id === orgId &&
          r.email === emailLower &&
          r.accepted_at === null &&
          r.cancelled_at === null
        ) {
          return { ok: true, exists: true };
        }
      }
      return { ok: true, exists: false };
    },
    async insertInvitation(row) {
      const nr = schemaNotReadyIf(schemaReady.invitation);
      if (nr) return nr;
      const id = `inv_${invitations.size + 1}`;
      const full: InvitationRow = {
        id,
        organization_id: row.organization_id,
        email: row.email,
        role: row.role,
        invited_by: row.invited_by,
        token_hash: row.token_hash,
        expires_at: row.expires_at,
        accepted_at: null,
        accepted_by: null,
        cancelled_at: null,
        cancelled_by: null,
        created_at: new Date().toISOString(),
      };
      invitations.set(id, full);
      return { ok: true, id };
    },
    async findByTokenHash(tokenHash) {
      const nr = schemaNotReadyIf(schemaReady.invitation);
      if (nr) return nr;
      for (const r of invitations.values()) {
        if (r.token_hash === tokenHash) return { ok: true, row: r };
      }
      return { ok: true, row: null };
    },
    async findInvitationById(id) {
      const nr = schemaNotReadyIf(schemaReady.invitation);
      if (nr) return nr;
      return { ok: true, row: invitations.get(id) ?? null };
    },
    async getOrgName(orgId) {
      const nr = schemaNotReadyIf(schemaReady.admin);
      if (nr) return nr;
      return { ok: true, name: orgNames.get(orgId) ?? orgId };
    },
    async getInviterName(userId) {
      const nr = schemaNotReadyIf(schemaReady.admin);
      if (nr) return nr;
      return { ok: true, name: inviterNames.get(userId) ?? "an admin" };
    },
    async acceptInvitationRpc(input) {
      const nr = schemaNotReadyIf(schemaReady.accept);
      if (nr) return nr;
      const row = invitations.get(input.invitation_id);
      if (!row || row.accepted_at !== null || row.cancelled_at !== null) {
        return { ok: false, error: "not_acceptable_state" };
      }
      const key = memberKey(input.organization_id, input.user_id);
      if (members.has(key)) {
        return { ok: true, alreadyMember: true };
      }
      members.set(key, {
        organization_id: input.organization_id,
        user_id: input.user_id,
        role: input.role,
        email: input.work_email,
      });
      row.accepted_at = new Date().toISOString();
      row.accepted_by = input.user_id;
      return { ok: true, alreadyMember: false };
    },
    async cancelInvitation({ id }) {
      const nr = schemaNotReadyIf(schemaReady.invitation);
      if (nr) return nr;
      const row = invitations.get(id);
      if (!row) return { ok: true, cancelled: false, alreadyAccepted: false };
      if (row.accepted_at !== null) {
        return { ok: true, cancelled: false, alreadyAccepted: true };
      }
      if (row.cancelled_at !== null) {
        return { ok: true, cancelled: false, alreadyAccepted: false };
      }
      row.cancelled_at = new Date().toISOString();
      return { ok: true, cancelled: true, alreadyAccepted: false };
    },
    async countExpiredPending(now) {
      const nr = schemaNotReadyIf(schemaReady.invitation);
      if (nr) return nr;
      let count = 0;
      for (const r of invitations.values()) {
        if (
          r.accepted_at === null &&
          r.cancelled_at === null &&
          new Date(r.expires_at) < now
        ) {
          count += 1;
        }
      }
      return { ok: true, count };
    },
  };

  return { db, invitations, members, orgAdmins, orgNames, inviterNames, schemaReady };
}

function makeDeps(
  state: FakeState,
  overrides: Partial<InvitationsDeps> = {},
): InvitationsDeps {
  const emails: Array<{ to: string; subject: string }> = [];
  const deps: InvitationsDeps = {
    db: state.db,
    sendEmail: async (m) => {
      emails.push({ to: m.to, subject: m.subject });
      return { ok: true };
    },
    rateLimit: async () => ({
      ok: true,
      retryAfterSec: 0,
      remaining: 19,
      limit: 20,
      resetAt: Math.floor(Date.now() / 1000) + 3600,
    }),
    appBaseUrl: "https://app.example.com",
    ...overrides,
  };
  // Attach sink for asserting sends.
  (deps as InvitationsDeps & { __emails: typeof emails }).__emails = emails;
  return deps;
}

// ---------------------------------------------------------------------------
// send()
// ---------------------------------------------------------------------------

describe("handleSend()", () => {
  it("401 when actor missing id", async () => {
    const s = makeFakeDb();
    const res = await handleSend(
      { actor: { id: "", email: "e@x" }, organizationId: "o1", email: "n@x.com", role: "admin" },
      makeDeps(s),
    );
    assert.equal(res.status, 401);
  });

  it("400 invalid email", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "not-an-email", role: "admin" },
      makeDeps(s),
    );
    assert.equal(res.status, 400);
    if (res.status === 400) assert.equal(res.body.error, "invalid_email");
  });

  it("400 invalid role", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    const res = await handleSend(
      // @ts-expect-error hostile input
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "n@x.com", role: "owner" },
      makeDeps(s),
    );
    assert.equal(res.status, 400);
  });

  it("429 when rate limit rejects", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "n@x.com", role: "admin" },
      makeDeps(s, {
        rateLimit: async () => ({
          ok: false,
          retryAfterSec: 42,
          remaining: 0,
          limit: 20,
          resetAt: Math.floor(Date.now() / 1000) + 42,
        }),
      }),
    );
    assert.equal(res.status, 429);
  });

  it("403 when actor is not org admin", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    const res = await handleSend(
      { actor: { id: "u_other", email: "o@x" }, organizationId: "o1", email: "n@x.com", role: "admin" },
      makeDeps(s),
    );
    assert.equal(res.status, 403);
  });

  it("409 already_member when target email is already in the org", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    s.members.set("o1::u_existing", { organization_id: "o1", user_id: "u_existing", role: "admin", email: "seat@x.com" });
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "SEAT@x.com", role: "booker" },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
    if (res.status === 409) assert.equal(res.body.error, "already_member");
  });

  it("409 pending_invite_exists when a pending invite already exists", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    s.invitations.set("inv_x", {
      id: "inv_x",
      organization_id: "o1",
      email: "seat@x.com",
      role: "admin",
      invited_by: "u_admin",
      token_hash: "abc",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "seat@x.com", role: "admin" },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
    if (res.status === 409) assert.equal(res.body.error, "pending_invite_exists");
  });

  it("200 happy path — inserts row, sends email, returns id", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    s.orgNames.set("o1", "AcmeCare");
    s.inviterNames.set("u_admin", "Alice");
    const deps = makeDeps(s);
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "seat@x.com", role: "booker" },
      deps,
    );
    assert.equal(res.status, 200);
    assert.equal(s.invitations.size, 1);
    const emails = (deps as InvitationsDeps & { __emails: Array<{ to: string; subject: string }> }).__emails;
    assert.equal(emails.length, 1);
    assert.equal(emails[0]!.to, "seat@x.com");
    assert.match(emails[0]!.subject, /AcmeCare/);
  });

  it("202 schema_not_ready when the invitations table is absent", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    s.schemaReady.admin = true;
    s.schemaReady.member = true;
    s.schemaReady.invitation = false;
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "seat@x.com", role: "admin" },
      makeDeps(s),
    );
    assert.equal(res.status, 202);
    if (res.status === 202) assert.equal(res.body.skippedReason, "schema_not_ready");
  });

  it("500 send_failed surfaces when Resend fails", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    const res = await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "n@x.com", role: "admin" },
      makeDeps(s, {
        sendEmail: async () => ({ ok: false, error: "boom" }),
      }),
    );
    assert.equal(res.status, 500);
  });

  it("lower-cases the invited email", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    await handleSend(
      { actor: { id: "u_admin", email: "a@x" }, organizationId: "o1", email: "MixedCase@X.COM", role: "admin" },
      makeDeps(s),
    );
    const row = Array.from(s.invitations.values())[0]!;
    assert.equal(row.email, "mixedcase@x.com");
  });
});

// ---------------------------------------------------------------------------
// preview()
// ---------------------------------------------------------------------------

describe("handlePreview()", () => {
  it("400 invalid_token when token empty", async () => {
    const s = makeFakeDb();
    const res = await handlePreview({ rawToken: "" }, makeDeps(s));
    assert.equal(res.status, 400);
  });

  it("404 not_found when token hash unknown", async () => {
    const s = makeFakeDb();
    const res = await handlePreview({ rawToken: "nothing" }, makeDeps(s));
    assert.equal(res.status, 404);
  });

  it("409 cancelled when invite is cancelled", async () => {
    const s = makeFakeDb();
    const raw = "cancelledtoken";
    s.invitations.set("inv_c", {
      id: "inv_c",
      organization_id: "o1",
      email: "e@x.com",
      role: "admin",
      invited_by: "u",
      token_hash: hashToken(raw),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: "u",
      created_at: new Date().toISOString(),
    });
    const res = await handlePreview({ rawToken: raw }, makeDeps(s));
    assert.equal(res.status, 409);
  });

  it("410 expired when expiry is past and not accepted", async () => {
    const s = makeFakeDb();
    const raw = "expiredtoken";
    s.invitations.set("inv_e", {
      id: "inv_e",
      organization_id: "o1",
      email: "e@x.com",
      role: "admin",
      invited_by: "u",
      token_hash: hashToken(raw),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
    const res = await handlePreview({ rawToken: raw }, makeDeps(s));
    assert.equal(res.status, 410);
  });

  it("200 happy — returns preview with org name + role + alreadyAccepted false", async () => {
    const s = makeFakeDb();
    const raw = "goodtoken";
    s.orgNames.set("o1", "AcmeCare");
    s.inviterNames.set("u_admin", "Alice");
    s.invitations.set("inv_ok", {
      id: "inv_ok",
      organization_id: "o1",
      email: "e@x.com",
      role: "booker",
      invited_by: "u_admin",
      token_hash: hashToken(raw),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
    const res = await handlePreview({ rawToken: raw }, makeDeps(s));
    assert.equal(res.status, 200);
    if (res.status === 200) {
      assert.equal(res.body.preview.orgName, "AcmeCare");
      assert.equal(res.body.preview.role, "booker");
      assert.equal(res.body.preview.inviterName, "Alice");
      assert.equal(res.body.preview.alreadyAccepted, false);
      assert.equal(res.body.preview.cancelled, false);
    }
  });

  it("202 schema_not_ready when invitations table absent", async () => {
    const s = makeFakeDb();
    s.schemaReady.invitation = false;
    const res = await handlePreview({ rawToken: "x" }, makeDeps(s));
    assert.equal(res.status, 202);
  });
});

// ---------------------------------------------------------------------------
// accept()
// ---------------------------------------------------------------------------

describe("handleAccept()", () => {
  function seedPending(state: FakeState, raw: string, email: string, role: "admin" | "booker" | "finance" | "viewer" = "admin") {
    state.invitations.set("inv_a", {
      id: "inv_a",
      organization_id: "o1",
      email,
      role,
      invited_by: "u_admin",
      token_hash: hashToken(raw),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
  }

  it("401 unauthenticated", async () => {
    const s = makeFakeDb();
    const res = await handleAccept(
      { rawToken: "x", actor: { id: "", email: null } },
      makeDeps(s),
    );
    assert.equal(res.status, 401);
  });

  it("404 not_found on unknown token", async () => {
    const s = makeFakeDb();
    const res = await handleAccept(
      { rawToken: "nope", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 404);
  });

  it("410 expired", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com");
    // Mutate expires_at into the past
    s.invitations.get("inv_a")!.expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 410);
  });

  it("409 cancelled", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com");
    s.invitations.get("inv_a")!.cancelled_at = new Date().toISOString();
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
    if (res.status === 409) assert.equal(res.body.error, "cancelled");
  });

  it("409 already_accepted", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com");
    s.invitations.get("inv_a")!.accepted_at = new Date().toISOString();
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
    if (res.status === 409) assert.equal(res.body.error, "already_accepted");
  });

  it("403 email_mismatch when actor email differs from invited email", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "invited@x.com");
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "someone-else@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 403);
    if (res.status === 403) assert.equal(res.body.error, "email_mismatch");
  });

  it("409 role_pending_d2 when invite role is finance", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com", "finance");
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
    if (res.status === 409) assert.equal(res.body.error, "role_pending_d2");
  });

  it("409 already_member when actor is already in the org", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com");
    s.members.set("o1::u1", { organization_id: "o1", user_id: "u1", role: "viewer", email: "e@x.com" });
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
    if (res.status === 409) assert.equal(res.body.error, "already_member");
  });

  it("200 happy — inserts member row + marks invitation accepted", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com", "booker");
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 200);
    if (res.status === 200) {
      assert.equal(res.body.orgId, "o1");
      assert.equal(res.body.role, "booker");
    }
    assert.equal(s.members.size, 1);
    assert.ok(s.invitations.get("inv_a")!.accepted_at !== null);
  });

  it("email match is case-insensitive", async () => {
    const s = makeFakeDb();
    seedPending(s, "raw", "e@x.com");
    const res = await handleAccept(
      { rawToken: "raw", actor: { id: "u1", email: "E@X.COM" } },
      makeDeps(s),
    );
    assert.equal(res.status, 200);
  });

  it("202 schema_not_ready when invitations table absent", async () => {
    const s = makeFakeDb();
    s.schemaReady.invitation = false;
    const res = await handleAccept(
      { rawToken: "x", actor: { id: "u1", email: "e@x.com" } },
      makeDeps(s),
    );
    assert.equal(res.status, 202);
  });
});

// ---------------------------------------------------------------------------
// cancel()
// ---------------------------------------------------------------------------

describe("handleCancel()", () => {
  it("401 unauthenticated", async () => {
    const s = makeFakeDb();
    const res = await handleCancel(
      { actor: { id: "", email: null }, invitationId: "inv" },
      makeDeps(s),
    );
    assert.equal(res.status, 401);
  });

  it("404 not_found on missing invitation", async () => {
    const s = makeFakeDb();
    const res = await handleCancel(
      { actor: { id: "u_admin", email: "a@x" }, invitationId: "missing" },
      makeDeps(s),
    );
    assert.equal(res.status, 404);
  });

  it("403 forbidden when actor isn't org admin", async () => {
    const s = makeFakeDb();
    s.invitations.set("inv_c", {
      id: "inv_c",
      organization_id: "o1",
      email: "e@x.com",
      role: "admin",
      invited_by: "u_admin",
      token_hash: "h",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
    const res = await handleCancel(
      { actor: { id: "u_other", email: "o@x" }, invitationId: "inv_c" },
      makeDeps(s),
    );
    assert.equal(res.status, 403);
  });

  it("409 already_accepted when invite already accepted", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    s.invitations.set("inv_c", {
      id: "inv_c",
      organization_id: "o1",
      email: "e@x.com",
      role: "admin",
      invited_by: "u_admin",
      token_hash: "h",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: new Date().toISOString(),
      accepted_by: "u_seat",
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
    const res = await handleCancel(
      { actor: { id: "u_admin", email: "a@x" }, invitationId: "inv_c" },
      makeDeps(s),
    );
    assert.equal(res.status, 409);
  });

  it("200 happy — marks invitation cancelled", async () => {
    const s = makeFakeDb();
    s.orgAdmins.set("o1", new Set(["u_admin"]));
    s.invitations.set("inv_c", {
      id: "inv_c",
      organization_id: "o1",
      email: "e@x.com",
      role: "admin",
      invited_by: "u_admin",
      token_hash: "h",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      accepted_at: null,
      accepted_by: null,
      cancelled_at: null,
      cancelled_by: null,
      created_at: new Date().toISOString(),
    });
    const res = await handleCancel(
      { actor: { id: "u_admin", email: "a@x" }, invitationId: "inv_c" },
      makeDeps(s),
    );
    assert.equal(res.status, 200);
    assert.ok(s.invitations.get("inv_c")!.cancelled_at !== null);
  });
});

// ---------------------------------------------------------------------------
// cron
// ---------------------------------------------------------------------------

describe("handleExpireCron()", () => {
  it("200 reports zero when no invites", async () => {
    const s = makeFakeDb();
    const res = await handleExpireCron({ db: s.db });
    assert.equal(res.status, 200);
    if (res.status === 200) assert.equal(res.body.expiredCount, 0);
  });

  it("200 counts pending invites past expiry, ignores accepted/cancelled", async () => {
    const s = makeFakeDb();
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    // Expired pending
    s.invitations.set("e1", {
      id: "e1", organization_id: "o1", email: "a@x", role: "admin", invited_by: "u",
      token_hash: "1", expires_at: past,
      accepted_at: null, accepted_by: null, cancelled_at: null, cancelled_by: null,
      created_at: past,
    });
    s.invitations.set("e2", {
      id: "e2", organization_id: "o1", email: "b@x", role: "admin", invited_by: "u",
      token_hash: "2", expires_at: past,
      accepted_at: null, accepted_by: null, cancelled_at: null, cancelled_by: null,
      created_at: past,
    });
    // Accepted → not counted
    s.invitations.set("a1", {
      id: "a1", organization_id: "o1", email: "c@x", role: "admin", invited_by: "u",
      token_hash: "3", expires_at: past,
      accepted_at: new Date().toISOString(), accepted_by: "x", cancelled_at: null, cancelled_by: null,
      created_at: past,
    });
    // Pending but not expired
    s.invitations.set("p1", {
      id: "p1", organization_id: "o1", email: "d@x", role: "admin", invited_by: "u",
      token_hash: "4", expires_at: future,
      accepted_at: null, accepted_by: null, cancelled_at: null, cancelled_by: null,
      created_at: past,
    });
    const res = await handleExpireCron({ db: s.db });
    assert.equal(res.status, 200);
    if (res.status === 200) assert.equal(res.body.expiredCount, 2);
  });

  it("202 schema_not_ready when table absent", async () => {
    const s = makeFakeDb();
    s.schemaReady.invitation = false;
    const res = await handleExpireCron({ db: s.db });
    assert.equal(res.status, 202);
  });
});

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

describe("buildAcceptUrl()", () => {
  it("appends the token as a query param", () => {
    const url = buildAcceptUrl("https://app.example.com", "abc");
    assert.equal(
      url,
      "https://app.example.com/org/invitations/accept?token=abc",
    );
  });

  it("URL-encodes tokens containing reserved characters", () => {
    const url = buildAcceptUrl("https://app.example.com/", "a b/+&");
    assert.ok(url.includes("token=a%20b%2F%2B%26"));
  });

  it("trims trailing slashes from the base URL", () => {
    const url = buildAcceptUrl("https://app.example.com///", "abc");
    assert.equal(url, "https://app.example.com/org/invitations/accept?token=abc");
  });
});
