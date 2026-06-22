/**
 * P1-B11 route-level tests for /api/m/chat/threads/[id]/participants.
 *
 * Drives the pure handlers from `@/lib/chat/participants-handler` with
 * stub clients. Authorization (only the seeker / admin can invite) is
 * enforced at the route boundary, so the handler tests focus on body
 * validation, email send wiring, and the listing shape.
 *
 * Per-route DELETE auth (403 for non-seeker) is exercised in the
 * adjacent [userId]/route.test.ts file.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleInviteFamily,
  handleListParticipants,
  handleRemoveParticipant,
  type ParticipantsClient,
  type ParticipantRow,
} from "@/lib/chat/participants-handler";

type Captured = {
  invites: {
    thread_id: string;
    invited_email: string;
    invited_by: string;
    token: string;
  }[];
  emails: {
    invited_email: string;
    inviter_name: string;
    accept_url: string;
    expires_at: string;
  }[];
  removed: { thread_id: string; user_id: string }[];
};

function makeClient(opts: {
  list?: ParticipantRow[];
  inviteError?: string;
  emailError?: string;
  inviterName?: string | null;
  activeRole?: ParticipantRow["role"] | null;
  removeError?: string;
}): { client: ParticipantsClient; captured: Captured } {
  const captured: Captured = { invites: [], emails: [], removed: [] };
  const client: ParticipantsClient = {
    async listParticipants() {
      return { data: opts.list ?? [], error: null };
    },
    async createInvite(args) {
      captured.invites.push(args);
      if (opts.inviteError) {
        return { data: null, error: { message: opts.inviteError } };
      }
      return {
        data: {
          id: "invite-1",
          thread_id: args.thread_id,
          invited_email: args.invited_email,
          invited_by: args.invited_by,
          token: args.token,
          expires_at: "2026-06-05T10:00:00.000Z",
          accepted_at: null,
        },
        error: null,
      };
    },
    async sendInviteEmail(args) {
      captured.emails.push(args);
      return opts.emailError
        ? { ok: false, error: opts.emailError }
        : { ok: true };
    },
    async getInviterName() {
      return opts.inviterName ?? "Alex Seeker";
    },
    async getActiveRole() {
      return { role: opts.activeRole ?? null };
    },
    async softRemoveParticipant(args) {
      captured.removed.push(args);
      return opts.removeError
        ? { ok: false, error: opts.removeError }
        : { ok: true };
    },
  };
  return { client, captured };
}

describe("POST /api/m/chat/threads/[id]/participants (handleInviteFamily)", () => {
  it("happy path: seeker invites family → invite row created, email sent", async () => {
    const { client, captured } = makeClient({});
    const res = await handleInviteFamily({
      thread_id: "thread-1",
      body: { email: "nan@example.com", role: "family" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
      tokenFactory: () => "fixed-token",
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      invite_id: string;
      invited_email: string;
      expires_at: string;
    };
    assert.equal(json.invite_id, "invite-1");
    assert.equal(json.invited_email, "nan@example.com");
    assert.equal(captured.invites.length, 1);
    assert.equal(captured.invites[0].token, "fixed-token");
    assert.equal(captured.emails.length, 1);
    assert.match(
      captured.emails[0].accept_url,
      /\/family\/accept\?token=fixed-token/,
    );
  });

  it("trims + lowercases the email before storing", async () => {
    const { client, captured } = makeClient({});
    const res = await handleInviteFamily({
      thread_id: "t-1",
      body: { email: "  Family@Example.COM  ", role: "family" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
      tokenFactory: () => "t",
    });
    assert.equal(res.status, 200);
    assert.equal(captured.invites[0].invited_email, "family@example.com");
  });

  it("400 when body is not an object", async () => {
    const { client } = makeClient({});
    const res = await handleInviteFamily({
      thread_id: "t-1",
      body: "nope",
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
    });
    assert.equal(res.status, 400);
  });

  it("400 when email is missing or malformed", async () => {
    const { client } = makeClient({});
    const r1 = await handleInviteFamily({
      thread_id: "t-1",
      body: { role: "family" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
    });
    assert.equal(r1.status, 400);
    const r2 = await handleInviteFamily({
      thread_id: "t-1",
      body: { email: "not-an-email", role: "family" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
    });
    assert.equal(r2.status, 400);
  });

  it("400 when role is not 'family'", async () => {
    const { client } = makeClient({});
    const res = await handleInviteFamily({
      thread_id: "t-1",
      body: { email: "x@y.com", role: "admin" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
    });
    assert.equal(res.status, 400);
  });

  it("500 when insert fails", async () => {
    const { client } = makeClient({ inviteError: "db_boom" });
    const res = await handleInviteFamily({
      thread_id: "t-1",
      body: { email: "x@y.com", role: "family" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
    });
    assert.equal(res.status, 500);
  });

  it("502 when email send fails (invite row still created)", async () => {
    const { client, captured } = makeClient({ emailError: "smtp_down" });
    const res = await handleInviteFamily({
      thread_id: "t-1",
      body: { email: "x@y.com", role: "family" },
      inviter_id: "seeker-1",
      site_url: "https://specialcarers.com",
      client,
      tokenFactory: () => "tk",
    });
    assert.equal(res.status, 502);
    assert.equal(captured.invites.length, 1);
  });
});

describe("GET /api/m/chat/threads/[id]/participants (handleListParticipants)", () => {
  it("returns the participants list as JSON", async () => {
    const list: ParticipantRow[] = [
      {
        user_id: "u1",
        role: "seeker",
        added_at: "2026-05-01T10:00:00Z",
        display_name: "Alex",
        avatar_url: null,
      },
      {
        user_id: "u2",
        role: "family",
        added_at: "2026-05-15T10:00:00Z",
        display_name: "Riley",
        avatar_url: "https://example.com/r.png",
      },
    ];
    const { client } = makeClient({ list });
    const res = await handleListParticipants({
      thread_id: "thread-1",
      client,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { participants: ParticipantRow[] };
    assert.equal(json.participants.length, 2);
    assert.equal(json.participants[0].role, "seeker");
    assert.equal(json.participants[1].role, "family");
  });
});

describe("DELETE → handleRemoveParticipant", () => {
  it("seeker removes a family member: soft-deletes and returns ok", async () => {
    const { client, captured } = makeClient({ activeRole: "family" });
    const res = await handleRemoveParticipant({
      thread_id: "t-1",
      user_id: "family-1",
      client,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(captured.removed, [
      { thread_id: "t-1", user_id: "family-1" },
    ]);
  });

  it("400 when attempting to remove the seeker", async () => {
    const { client, captured } = makeClient({ activeRole: "seeker" });
    const res = await handleRemoveParticipant({
      thread_id: "t-1",
      user_id: "seeker-1",
      client,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(captured.removed, []);
  });

  it("400 when attempting to remove the carer", async () => {
    const { client, captured } = makeClient({ activeRole: "carer" });
    const res = await handleRemoveParticipant({
      thread_id: "t-1",
      user_id: "carer-1",
      client,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(captured.removed, []);
  });

  it("404 when the target is not an active participant", async () => {
    const { client } = makeClient({ activeRole: null });
    const res = await handleRemoveParticipant({
      thread_id: "t-1",
      user_id: "ghost",
      client,
    });
    assert.equal(res.status, 404);
  });

  it("500 when the soft-delete update errors", async () => {
    const { client } = makeClient({
      activeRole: "family",
      removeError: "boom",
    });
    const res = await handleRemoveParticipant({
      thread_id: "t-1",
      user_id: "family-1",
      client,
    });
    assert.equal(res.status, 500);
  });
});
