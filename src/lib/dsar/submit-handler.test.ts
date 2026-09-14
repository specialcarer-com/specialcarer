/**
 * Unit tests for the pure DSAR submit handler.
 *
 * Covers the four flows required by PR E2:
 *
 *   1. Anonymous + valid payload  -> row inserted in `verifying`,
 *      verification email sent, state stays `verifying`.
 *   2. Authenticated + subject_user_id matches auth.uid + email
 *      matches -> row inserted, `verified_at` set, state =
 *      `in_progress`, confirmation email (not verification) sent.
 *   3. Authenticated + subject_user_id mismatch -> treated as
 *      anonymous (email-verify path).
 *   4. Authenticated + subject_email mismatch -> treated as
 *      anonymous (email-verify path). Choice documented in the
 *      delivery report §7: fall-through rather than 400, so a
 *      signed-in user pasting the wrong email doesn't blow up.
 *
 * Plus regression coverage for validation (bad email / bad type)
 * and `schema_not_ready`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleDsarSubmit,
  type SubmitBody,
  type SubmitDeps,
  type AuthedUser,
} from "@/lib/dsar/submit-handler";

type Insert = { table: string; row: Record<string, unknown> };
type MailCall = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const USER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_ID = "99999999-2222-3333-4444-555555555555";
const EMAIL = "subject@example.com";
const OTHER_EMAIL = "other@example.com";

function makeAdmin(opts: {
  inserts: Insert[];
  insertError?: { code?: string; message: string } | null;
  profileId?: string | null;
}) {
  const admin = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: opts.profileId
                        ? { id: opts.profileId }
                        : null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "dsar_requests") {
        return {
          insert(row: Record<string, unknown>) {
            opts.inserts.push({ table, row });
            return {
              select() {
                return {
                  async single() {
                    if (opts.insertError) {
                      return {
                        data: null,
                        error: opts.insertError,
                      };
                    }
                    return {
                      data: { id: "dsar-1" },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return admin as unknown as SubmitDeps["admin"];
}

function makeDeps(opts: {
  inserts?: Insert[];
  mails?: MailCall[];
  authedUser?: AuthedUser | null;
  profileId?: string | null;
  insertError?: { code?: string; message: string } | null;
}): { deps: SubmitDeps; inserts: Insert[]; mails: MailCall[] } {
  const inserts = opts.inserts ?? [];
  const mails = opts.mails ?? [];
  return {
    deps: {
      admin: makeAdmin({
        inserts,
        profileId: opts.profileId ?? null,
        insertError: opts.insertError ?? null,
      }),
      authedUser: opts.authedUser ?? null,
      sendEmail: async (m) => {
        mails.push(m);
      },
      origin: "https://specialcarer.com",
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    },
    inserts,
    mails,
  };
}

describe("handleDsarSubmit", () => {
  it("anonymous + valid payload -> verifying state + verification email", async () => {
    const { deps, inserts, mails } = makeDeps({});
    const body: SubmitBody = { email: EMAIL, type: "access" };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    if (!("fast_path" in res.body)) {
      throw new Error("expected success body");
    }
    assert.equal(res.body.fast_path, false);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].row.state, "verifying");
    assert.equal(inserts[0].row.subject_email, EMAIL);
    assert.equal(inserts[0].row.verified_at, undefined);
    assert.ok(inserts[0].row.verification_token_hash);
    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /Confirm your SpecialCarer/);
    assert.match(mails[0].html, /api\/dsar\/verify\//);
  });

  it("authenticated + matching id + matching email -> fast path, in_progress + confirmation email", async () => {
    const authed: AuthedUser = { id: USER_ID, email: EMAIL };
    const { deps, inserts, mails } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: EMAIL,
      subject_user_id: USER_ID,
      request_type: "portability",
      notes: "please include chat transcripts",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    if (!("fast_path" in res.body)) throw new Error("expected success body");
    assert.equal(res.body.fast_path, true);

    assert.equal(inserts.length, 1);
    const row = inserts[0].row;
    assert.equal(row.state, "in_progress");
    assert.ok(typeof row.verified_at === "string" && row.verified_at.length > 0);
    assert.equal(row.subject_user_id, USER_ID);
    assert.equal(row.requested_by, USER_ID);
    assert.equal(row.request_type, "portability");
    assert.equal(row.notes, "please include chat transcripts");
    assert.equal(
      row.verification_token_hash,
      undefined,
      "fast path must not issue a verification token",
    );

    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /We received your/);
    assert.doesNotMatch(mails[0].html, /api\/dsar\/verify\//);
  });

  it("authenticated + email casing mismatch (Same after lowercasing) still fast-paths", async () => {
    const authed: AuthedUser = {
      id: USER_ID,
      email: EMAIL.toUpperCase(),
    };
    const { deps, inserts, mails } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: EMAIL, // already lower-case
      subject_user_id: USER_ID,
      request_type: "access",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    if (!("fast_path" in res.body)) throw new Error("expected success body");
    assert.equal(res.body.fast_path, true);
    assert.equal(inserts[0].row.state, "in_progress");
    assert.equal(mails[0].subject.includes("Confirm"), false);
  });

  it("authenticated + subject_user_id mismatch -> treated as anonymous", async () => {
    const authed: AuthedUser = { id: USER_ID, email: EMAIL };
    const { deps, inserts, mails } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: EMAIL,
      subject_user_id: OTHER_ID,
      request_type: "access",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    if (!("fast_path" in res.body)) throw new Error("expected success body");
    assert.equal(res.body.fast_path, false);
    assert.equal(inserts[0].row.state, "verifying");
    assert.match(mails[0].subject, /Confirm your SpecialCarer/);
  });

  it("authenticated + subject_email mismatch -> treated as anonymous (does NOT 400)", async () => {
    const authed: AuthedUser = { id: USER_ID, email: EMAIL };
    const { deps, inserts, mails } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: OTHER_EMAIL,
      subject_user_id: USER_ID,
      request_type: "access",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    if (!("fast_path" in res.body)) throw new Error("expected success body");
    assert.equal(res.body.fast_path, false);
    assert.equal(inserts[0].row.state, "verifying");
    // The verification email goes to the OTHER email address, so the
    // signed-in user can't actually complete the flow unless they own
    // it too. Safe fallback.
    assert.equal(mails[0].to, OTHER_EMAIL);
  });

  it("rejects invalid email", async () => {
    const { deps, inserts, mails } = makeDeps({});
    const res = await handleDsarSubmit(
      { email: "not-an-email", type: "access" },
      deps,
    );
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: "invalid_email" });
    assert.equal(inserts.length, 0);
    assert.equal(mails.length, 0);
  });

  it("rejects invalid type", async () => {
    const { deps, inserts, mails } = makeDeps({});
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "malicious" },
      deps,
    );
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { ok: false, code: "invalid_type" });
    assert.equal(inserts.length, 0);
    assert.equal(mails.length, 0);
  });

  it("returns schema_not_ready on 42P01", async () => {
    const { deps, mails } = makeDeps({
      insertError: { code: "42P01", message: "relation does not exist" },
    });
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access" },
      deps,
    );
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { ok: false, code: "schema_not_ready" });
    assert.equal(mails.length, 0);
  });

  it("returns insert_failed on generic insert error", async () => {
    const { deps, mails } = makeDeps({
      insertError: { code: "23505", message: "duplicate" },
    });
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access" },
      deps,
    );
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { ok: false, code: "insert_failed" });
    assert.equal(mails.length, 0);
  });

  it("accepts `type` OR `request_type` key (settings/data client uses request_type)", async () => {
    const { deps, inserts } = makeDeps({});
    const res = await handleDsarSubmit(
      { email: EMAIL, request_type: "rectification" },
      deps,
    );
    assert.equal(res.status, 202);
    assert.equal(inserts[0].row.request_type, "rectification");
  });

  it("caps notes to 2000 chars", async () => {
    const { deps, inserts } = makeDeps({});
    const long = "x".repeat(2500);
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access", notes: long },
      deps,
    );
    assert.equal(res.status, 202);
    const notes = inserts[0].row.notes as string;
    assert.equal(notes.length, 2000);
  });

  it("anonymous with matching profile lookup fills subject_user_id", async () => {
    const { deps, inserts } = makeDeps({ profileId: USER_ID });
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access" },
      deps,
    );
    assert.equal(res.status, 202);
    assert.equal(inserts[0].row.subject_user_id, USER_ID);
  });
});
