/**
 * P1-B11 route-level tests for /api/family/accept (POST).
 *
 * Drives `handleAcceptInvite` from `@/lib/chat/family-accept-handler`
 * with a stub AcceptClient. Covers the documented status codes: 410 for
 * expired / unknown / already-accepted tokens, 401 with needs_signin
 * for signed-out callers, 200 success with system-message side-effect.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleAcceptInvite,
  type AcceptClient,
  type AcceptInviteRow,
} from "@/lib/chat/family-accept-handler";

const VALID_INVITE: AcceptInviteRow = {
  id: "invite-1",
  thread_id: "thread-1",
  invited_email: "fam@example.com",
  invited_by: "seeker-1",
  expires_at: "2026-12-01T00:00:00.000Z",
  accepted_at: null,
};

type Captured = {
  upserts: { thread_id: string; user_id: string; added_by: string }[];
  marks: { invite_id: string; user_id: string }[];
  systemMsgs: { thread_id: string; body: string; sender_id: string }[];
};

function makeClient(opts: {
  invite?: AcceptInviteRow | null;
  inviteError?: string;
  upsertError?: string;
  markError?: string;
  systemError?: string;
  displayName?: string | null;
  seekerId?: string | null;
}): { client: AcceptClient; captured: Captured } {
  const captured: Captured = { upserts: [], marks: [], systemMsgs: [] };
  const client: AcceptClient = {
    async findInviteByToken() {
      if (opts.inviteError) {
        return { data: null, error: { message: opts.inviteError } };
      }
      return { data: opts.invite ?? null, error: null };
    },
    async upsertFamilyParticipant(args) {
      captured.upserts.push(args);
      return opts.upsertError
        ? { ok: false, error: opts.upsertError }
        : { ok: true };
    },
    async markInviteAccepted(args) {
      captured.marks.push(args);
      return opts.markError
        ? { ok: false, error: opts.markError }
        : { ok: true };
    },
    async insertSystemMessage(args) {
      captured.systemMsgs.push(args);
      return opts.systemError
        ? { ok: false, error: opts.systemError }
        : { ok: true };
    },
    async getDisplayName() {
      return opts.displayName === undefined ? "Riley" : opts.displayName;
    },
    async getThreadSeekerId() {
      return opts.seekerId === undefined ? "seeker-1" : opts.seekerId;
    },
  };
  return { client, captured };
}

describe("POST /api/family/accept (handleAcceptInvite)", () => {
  it("happy path: valid token + signed-in user → adds family + posts system msg", async () => {
    const { client, captured } = makeClient({ invite: VALID_INVITE });
    const res = await handleAcceptInvite({
      body: { token: "t1" },
      user_id: "new-fam-user",
      client,
      now: new Date("2026-05-29T12:00:00Z"),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok: boolean; thread_id: string };
    assert.equal(json.ok, true);
    assert.equal(json.thread_id, "thread-1");
    assert.deepEqual(captured.upserts, [
      { thread_id: "thread-1", user_id: "new-fam-user", added_by: "seeker-1" },
    ]);
    assert.equal(captured.marks.length, 1);
    assert.equal(captured.systemMsgs.length, 1);
    assert.match(
      captured.systemMsgs[0].body,
      /Riley \(family\) was added by the seeker/,
    );
    assert.equal(captured.systemMsgs[0].sender_id, "seeker-1");
  });

  it("401 needs_signin when caller is signed out", async () => {
    const { client, captured } = makeClient({ invite: VALID_INVITE });
    const res = await handleAcceptInvite({
      body: { token: "t1" },
      user_id: null,
      client,
      now: new Date("2026-05-29T12:00:00Z"),
    });
    assert.equal(res.status, 401);
    const json = (await res.json()) as { needs_signin?: boolean };
    assert.equal(json.needs_signin, true);
    assert.equal(captured.upserts.length, 0);
  });

  it("410 when token is unknown", async () => {
    const { client } = makeClient({ invite: null });
    const res = await handleAcceptInvite({
      body: { token: "ghost" },
      user_id: "u1",
      client,
    });
    assert.equal(res.status, 410);
  });

  it("410 when invite is already accepted", async () => {
    const { client } = makeClient({
      invite: { ...VALID_INVITE, accepted_at: "2026-05-01T00:00:00Z" },
    });
    const res = await handleAcceptInvite({
      body: { token: "t" },
      user_id: "u1",
      client,
    });
    assert.equal(res.status, 410);
  });

  it("410 when invite is expired", async () => {
    const { client } = makeClient({
      invite: { ...VALID_INVITE, expires_at: "2026-01-01T00:00:00Z" },
    });
    const res = await handleAcceptInvite({
      body: { token: "t" },
      user_id: "u1",
      client,
      now: new Date("2026-05-29T12:00:00Z"),
    });
    assert.equal(res.status, 410);
  });

  it("400 when body lacks a string token", async () => {
    const { client } = makeClient({});
    const res = await handleAcceptInvite({
      body: {},
      user_id: "u1",
      client,
    });
    assert.equal(res.status, 400);
  });

  it("system-message failure does not roll back the accept", async () => {
    const { client, captured } = makeClient({
      invite: VALID_INVITE,
      systemError: "boom",
    });
    const res = await handleAcceptInvite({
      body: { token: "t" },
      user_id: "u1",
      client,
      now: new Date("2026-05-29T12:00:00Z"),
    });
    assert.equal(res.status, 200);
    assert.equal(captured.upserts.length, 1);
  });
});
