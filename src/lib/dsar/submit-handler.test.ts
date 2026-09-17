/**
 * Unit tests for the pure DSAR submit handler.
 *
 * ---------------------------------------------------------------------------
 * F1d SOFT PAUSE (17 Sep 2026):
 *
 * These tests cover the soft-paused behaviour. The pre-pause tests
 * (verifying/in_progress + verification/confirmation emails, F1a
 * failure-mode coverage) will come back when the parallel exporter-fix
 * PR reverts the pause. Do NOT delete the "revert checklist" comment
 * at the bottom of this file — it's the recovery contract.
 * ---------------------------------------------------------------------------
 *
 * Covered during pause:
 *
 *   1. Anonymous submission -> row inserted in
 *      `awaiting_manual_fulfilment`, NO verification email, ops alert
 *      dispatched, response body includes `manual_fulfilment: true`
 *      and the British-English message.
 *   2. Authenticated fast-path submission -> same state, `verified_at`
 *      IS stamped so the audit trail records session-proven ownership.
 *   3. Auth mismatch (uid or email) -> handled as anonymous (no
 *      `verified_at`), still paused.
 *   4. Notes column: bot marker appended; caller-supplied notes are
 *      preserved and prefixed.
 *   5. Ops mailbox: defaults to `ops@specialcarer.com`, respects
 *      injected `opsMailbox`, does NOT fail the request if send fails.
 *   6. Validation: invalid email / invalid type still 400.
 *   7. Schema-not-ready still 503; generic insert error still 500.
 *   8. `type` OR `request_type` still accepted; notes still capped at
 *      2000 chars (pre-existing invariants).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleDsarSubmit,
  MANUAL_FULFILMENT_STATE,
  MANUAL_FULFILMENT_MESSAGE,
  type SubmitBody,
  type SubmitDeps,
  type AuthedUser,
} from "@/lib/dsar/submit-handler";

type Insert = { table: string; row: Record<string, unknown> };
type Update = { table: string; patch: Record<string, unknown> };
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
  updates?: Update[];
  insertError?: { code?: string; message: string } | null;
  updateError?: { code?: string; message: string } | null;
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
          update(patch: Record<string, unknown>) {
            opts.updates?.push({ table, patch });
            return {
              async eq() {
                if (opts.updateError) {
                  return { error: opts.updateError };
                }
                return { error: null };
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
  updates?: Update[];
  mails?: MailCall[];
  authedUser?: AuthedUser | null;
  profileId?: string | null;
  insertError?: { code?: string; message: string } | null;
  updateError?: { code?: string; message: string } | null;
  sendEmailImpl?: (m: MailCall) => Promise<unknown>;
  opsMailbox?: string;
  pauseReference?: string;
}): {
  deps: SubmitDeps;
  inserts: Insert[];
  updates: Update[];
  mails: MailCall[];
} {
  const inserts = opts.inserts ?? [];
  const updates = opts.updates ?? [];
  const mails = opts.mails ?? [];
  return {
    deps: {
      admin: makeAdmin({
        inserts,
        updates,
        profileId: opts.profileId ?? null,
        insertError: opts.insertError ?? null,
        updateError: opts.updateError ?? null,
      }),
      authedUser: opts.authedUser ?? null,
      sendEmail: async (m) => {
        mails.push(m);
        if (opts.sendEmailImpl) return opts.sendEmailImpl(m);
        return { ok: true, messageId: "test-msg" };
      },
      origin: "https://specialcarer.com",
      now: () => new Date("2026-09-17T12:00:00.000Z"),
      opsMailbox: opts.opsMailbox,
      pauseReference: opts.pauseReference,
    },
    inserts,
    updates,
    mails,
  };
}

describe("handleDsarSubmit — F1d soft-pause", () => {
  it("anonymous + valid payload -> awaiting_manual_fulfilment, NO verification email, ops alert dispatched", async () => {
    const { deps, inserts, mails } = makeDeps({});
    const body: SubmitBody = { email: EMAIL, type: "access" };
    const res = await handleDsarSubmit(body, deps);

    assert.equal(res.status, 202);
    if (!("manual_fulfilment" in res.body)) {
      throw new Error("expected soft-pause body shape");
    }
    assert.equal(res.body.ok, true);
    assert.equal(res.body.manual_fulfilment, true);
    assert.equal(res.body.message, MANUAL_FULFILMENT_MESSAGE);
    assert.equal(typeof res.body.id, "string");

    assert.equal(inserts.length, 1);
    const row = inserts[0].row;
    assert.equal(row.state, MANUAL_FULFILMENT_STATE);
    assert.equal(row.subject_email, EMAIL);
    assert.equal(
      row.verified_at,
      undefined,
      "anonymous path must NOT stamp verified_at",
    );
    assert.equal(
      row.verification_token_hash,
      undefined,
      "no verification token is issued during the pause",
    );
    assert.match(row.notes as string, /Automated exporter paused/);
    assert.match(row.notes as string, /Fulfil manually via admin/);

    // Exactly one email: the ops alert. NO subject-facing verification.
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, "ops@specialcarer.com");
    assert.match(mails[0].subject, /Manual fulfilment needed/);
    assert.match(mails[0].text, /anonymous/);
    assert.match(mails[0].text, new RegExp(EMAIL));
  });

  it("authenticated + matching id + matching email -> awaiting_manual_fulfilment, verified_at IS set, ops alert marks source=authenticated", async () => {
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
    if (!("manual_fulfilment" in res.body)) {
      throw new Error("expected soft-pause body shape");
    }
    assert.equal(res.body.manual_fulfilment, true);

    assert.equal(inserts.length, 1);
    const row = inserts[0].row;
    assert.equal(row.state, MANUAL_FULFILMENT_STATE);
    assert.ok(
      typeof row.verified_at === "string" && row.verified_at.length > 0,
      "fast-path must still stamp verified_at even during pause",
    );
    assert.equal(row.subject_user_id, USER_ID);
    assert.equal(row.requested_by, USER_ID);
    assert.equal(row.request_type, "portability");
    // Caller-supplied notes preserved AND bot marker appended.
    const notes = row.notes as string;
    assert.match(notes, /please include chat transcripts/);
    assert.match(notes, /Automated exporter paused/);

    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /authenticated/);
  });

  it("authenticated + email casing mismatch (same after lowercasing) still stamps verified_at", async () => {
    const authed: AuthedUser = {
      id: USER_ID,
      email: EMAIL.toUpperCase(),
    };
    const { deps, inserts } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: EMAIL,
      subject_user_id: USER_ID,
      request_type: "access",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    assert.equal(inserts[0].row.state, MANUAL_FULFILMENT_STATE);
    assert.ok(inserts[0].row.verified_at, "case-insensitive match still fast-paths");
  });

  it("authenticated + subject_user_id mismatch -> handled as anonymous (no verified_at), still paused", async () => {
    const authed: AuthedUser = { id: USER_ID, email: EMAIL };
    const { deps, inserts, mails } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: EMAIL,
      subject_user_id: OTHER_ID,
      request_type: "access",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    assert.equal(inserts[0].row.state, MANUAL_FULFILMENT_STATE);
    assert.equal(inserts[0].row.verified_at, undefined);
    assert.match(mails[0].text, /anonymous/);
  });

  it("authenticated + subject_email mismatch -> handled as anonymous, ops alert still fires (does NOT go to subject)", async () => {
    const authed: AuthedUser = { id: USER_ID, email: EMAIL };
    const { deps, inserts, mails } = makeDeps({ authedUser: authed });
    const body: SubmitBody = {
      subject_email: OTHER_EMAIL,
      subject_user_id: USER_ID,
      request_type: "access",
    };
    const res = await handleDsarSubmit(body, deps);
    assert.equal(res.status, 202);
    assert.equal(inserts[0].row.state, MANUAL_FULFILMENT_STATE);
    assert.equal(inserts[0].row.verified_at, undefined);
    // The single email is the OPS alert, NOT a subject-facing mail
    // sent to OTHER_EMAIL — during the pause we never email the
    // subject directly from this handler.
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, "ops@specialcarer.com");
  });

  it("ops mailbox: respects injected opsMailbox", async () => {
    const { deps, mails } = makeDeps({ opsMailbox: "dpo@example.com" });
    await handleDsarSubmit({ email: EMAIL, type: "access" }, deps);
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, "dpo@example.com");
  });

  it("ops mailbox: request still succeeds if ops alert send fails", async () => {
    const { deps, inserts } = makeDeps({
      sendEmailImpl: async () => ({ ok: false, error: "resend 500" }),
    });
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access" },
      deps,
    );
    // Row exists, statutory clock is ticking, subject sees the 202.
    assert.equal(res.status, 202);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].row.state, MANUAL_FULFILMENT_STATE);
  });

  it("ops mailbox: request still succeeds if ops alert throws", async () => {
    const { deps, inserts } = makeDeps({
      sendEmailImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access" },
      deps,
    );
    assert.equal(res.status, 202);
    assert.equal(inserts.length, 1);
  });

  it("pauseReference is embedded in the notes column", async () => {
    const { deps, inserts } = makeDeps({
      pauseReference: "PR #241",
    });
    await handleDsarSubmit({ email: EMAIL, type: "access" }, deps);
    assert.match(inserts[0].row.notes as string, /PR #241/);
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
    // No ops alert if we can't even insert the row.
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

  it("caps user notes to 2000 chars before appending pause marker", async () => {
    const { deps, inserts } = makeDeps({});
    // Use a character that does NOT appear in the pause marker so we
    // can count exactly what the caller supplied.
    const long = "Q".repeat(2500);
    const res = await handleDsarSubmit(
      { email: EMAIL, type: "access", notes: long },
      deps,
    );
    assert.equal(res.status, 202);
    const notes = inserts[0].row.notes as string;
    // 2000 Q's from the caller, then separator + pause marker.
    assert.equal((notes.match(/Q/g) ?? []).length, 2000);
    assert.ok(notes.startsWith("Q".repeat(2000)));
    assert.match(notes, /Automated exporter paused/);
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

/*
 * ---------------------------------------------------------------------------
 * REVERT CHECKLIST — when the parallel DSAR exporter-fix PR ships:
 *
 * 1. Revert this test file to the pre-pause version at commit before F1d
 *    landed (or restore the following coverage manually):
 *      - anonymous -> state=verifying + verification email sent
 *      - fast-path -> state=in_progress + confirmation email + verified_at
 *      - id/email mismatch -> falls through to anonymous
 *      - F1a: verification-email failure -> row flipped to `failed`
 *      - F1a: send fails AND row-update fails -> distinct error code +
 *        loud console.error CRITICAL log
 *      - F1a: cap `verification_error` at 500 chars
 *      - F1a: ok:false with empty error -> fallback message stamped
 *
 * 2. Revert src/lib/dsar/submit-handler.ts, src/app/api/dsar/submit/route.ts,
 *    src/app/api/cron/dsar-fulfil/route.ts, and the admin queue chip changes.
 *
 * 3. Remove the `awaiting_manual_fulfilment` state from
 *    supabase/migrations/20260917000000_dsar_manual_fulfilment_state.sql
 *    (or add a follow-up migration that drops it from the CHECK once no
 *    rows in the state remain).
 * ---------------------------------------------------------------------------
 */
