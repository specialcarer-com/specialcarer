/**
 * Unit tests for the pure DSAR fulfilment handler (F1a).
 *
 * Covers:
 *
 *   1. Row with `subject_user_id` already set -> normal delivery flow
 *      (upload -> sign -> email -> mark delivered).
 *   2. Anonymous row (subject_user_id=null) with a MATCHING auth.users
 *      email -> resolves the user id, backfills the row, delivers.
 *      This is the F1a bug fix — previously silently skipped.
 *   3. Anonymous row with NO matching auth.users -> status
 *      `skipped_no_matching_user` (never the old silent
 *      `skipped_no_subject`).
 *   4. Email matching is case-insensitive across pages of listUsers.
 *   5. tallyResults() correctly counts delivered / resolved /
 *      skipped_no_user / errors.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  processDsarQueue,
  tallyResults,
  resolveUserIdByEmail,
  STORAGE_BUCKET,
  type FulfilAdmin,
  type FulfilDeps,
  type QueuedRequest,
} from "./fulfil-handler";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SUBJECT_EMAIL = "familytest@specialcarer.com";
const REQUEST_ID = "req-1";

type MailCall = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type UpdateCall = {
  table: string;
  patch: Record<string, unknown>;
};

type UploadCall = {
  bucket: string;
  path: string;
  contentType: string | undefined;
};

/**
 * Build a stub admin client good enough to drive processDsarQueue.
 *
 * `authUsers` is the list returned by `admin.auth.admin.listUsers`;
 * empty array simulates "no matching user found".
 *
 * `.from(<table>)` returns a chainable that:
 *   - For `dsar_requests`, records .update() patches into `updates`.
 *   - For any other table (called by exportSubject), returns an empty
 *     rows response so exportSubject completes with an empty manifest.
 *
 * `.storage.from(<bucket>)` records upload calls into `uploads` and
 * returns a fake signed URL.
 */
function makeAdmin(opts: {
  authUsers?: Array<{ id: string; email: string | null }>;
  pageSize?: number;
  uploadError?: { message: string } | null;
  signError?: { message: string } | null;
  updateError?: { message: string } | null;
  backfillError?: { message: string } | null;
  updates?: UpdateCall[];
  uploads?: UploadCall[];
}): FulfilAdmin {
  const users = opts.authUsers ?? [];
  const updates = opts.updates ?? [];
  const uploads = opts.uploads ?? [];
  const pageSize = opts.pageSize ?? 200;

  const admin = {
    from(table: string) {
      const chain = {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null });
            },
            or() {
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          updates.push({ table, patch });
          // Track whether this is the backfill (only subject_user_id)
          // or the final delivered update. Both share the same chain
          // shape: .eq('id').eq('state') -> Promise.
          const isBackfill = Object.keys(patch).length === 1 &&
            "subject_user_id" in patch;
          return {
            eq() {
              return {
                eq() {
                  if (isBackfill && opts.backfillError) {
                    return Promise.resolve({ error: opts.backfillError });
                  }
                  if (!isBackfill && opts.updateError) {
                    return Promise.resolve({ error: opts.updateError });
                  }
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
      return chain;
    },
    auth: {
      admin: {
        async listUsers(args: { page: number; perPage: number }) {
          const start = (args.page - 1) * args.perPage;
          const slice = users.slice(start, start + args.perPage);
          return { data: { users: slice }, error: null };
        },
      },
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(
            path: string,
            _body: Blob,
            options: { contentType?: string; upsert?: boolean },
          ) {
            uploads.push({ bucket, path, contentType: options.contentType });
            if (opts.uploadError) return { error: opts.uploadError };
            return { error: null };
          },
          async createSignedUrl(path: string, _ttl: number) {
            if (opts.signError) {
              return { data: null, error: opts.signError };
            }
            return {
              data: { signedUrl: `https://signed.example/${path}?sig=x` },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as FulfilAdmin;

  // Also expose pageSize into the listUsers slice by monkey-patching
  // above (pageSize is already used via args.perPage). The `pageSize`
  // opts field is available for tests that want to force a small page
  // size — passing pageSize into listUsers is a test-only knob so we
  // just re-slice using it.
  if (opts.pageSize && opts.pageSize < pageSize) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).auth.admin.listUsers = async (args: {
      page: number;
      perPage: number;
    }) => {
      const start = (args.page - 1) * opts.pageSize!;
      const slice = users.slice(start, start + opts.pageSize!);
      return { data: { users: slice }, error: null };
    };
  }

  return admin;
}

function makeDeps(opts: {
  admin: FulfilAdmin;
  mails?: MailCall[];
}): FulfilDeps {
  const mails = opts.mails ?? [];
  return {
    admin: opts.admin,
    sendEmail: async (m) => {
      mails.push({
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
      });
      return { ok: true, messageId: "test-msg-id" };
    },
    now: () => new Date("2026-09-15T23:15:00.000Z"),
  };
}

describe("processDsarQueue", () => {
  it("row with subject_user_id already set -> normal delivery path", async () => {
    const updates: UpdateCall[] = [];
    const uploads: UploadCall[] = [];
    const admin = makeAdmin({ updates, uploads });
    const mails: MailCall[] = [];
    const deps = makeDeps({ admin, mails });

    const rows: QueuedRequest[] = [
      {
        id: REQUEST_ID,
        subject_user_id: USER_ID,
        subject_email: SUBJECT_EMAIL,
        request_type: "access",
      },
    ];

    const results = await processDsarQueue(rows, deps);

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "delivered");
    assert.equal(results[0].resolved_subject_user_id, undefined);

    // One upload to the correct bucket at the request-scoped path
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].bucket, STORAGE_BUCKET);
    assert.equal(uploads[0].path, `${REQUEST_ID}/subject-export.json`);
    assert.equal(uploads[0].contentType, "application/json");

    // One delivery email
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, SUBJECT_EMAIL);
    assert.match(mails[0].html, /signed\.example/);

    // Exactly one update: state -> delivered (no backfill for this row)
    assert.equal(updates.length, 1);
    assert.equal(updates[0].patch.state, "delivered");
    assert.ok(typeof updates[0].patch.delivered_at === "string");
    assert.equal(
      updates[0].patch.delivery_object_path,
      `${REQUEST_ID}/subject-export.json`,
    );
  });

  it("anonymous row + matching auth.users -> resolves, backfills, delivers", async () => {
    const updates: UpdateCall[] = [];
    const uploads: UploadCall[] = [];
    const admin = makeAdmin({
      authUsers: [
        { id: "other-user", email: "other@example.com" },
        { id: USER_ID, email: SUBJECT_EMAIL },
      ],
      updates,
      uploads,
    });
    const mails: MailCall[] = [];
    const deps = makeDeps({ admin, mails });

    const rows: QueuedRequest[] = [
      {
        id: REQUEST_ID,
        subject_user_id: null,
        subject_email: SUBJECT_EMAIL,
        request_type: "access",
      },
    ];

    const results = await processDsarQueue(rows, deps);

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "delivered");
    assert.equal(results[0].resolved_subject_user_id, USER_ID);

    // Two updates: backfill subject_user_id, then flip to delivered
    assert.equal(updates.length, 2);
    assert.equal(updates[0].patch.subject_user_id, USER_ID);
    assert.equal(Object.keys(updates[0].patch).length, 1);
    assert.equal(updates[1].patch.state, "delivered");

    // Delivered email fired
    assert.equal(mails.length, 1);
  });

  it("anonymous row + NO matching auth.users -> skipped_no_matching_user (not silent)", async () => {
    const updates: UpdateCall[] = [];
    const uploads: UploadCall[] = [];
    const admin = makeAdmin({
      authUsers: [{ id: "someone-else", email: "other@example.com" }],
      updates,
      uploads,
    });
    const mails: MailCall[] = [];
    const deps = makeDeps({ admin, mails });

    const rows: QueuedRequest[] = [
      {
        id: REQUEST_ID,
        subject_user_id: null,
        subject_email: SUBJECT_EMAIL,
        request_type: "access",
      },
    ];

    const results = await processDsarQueue(rows, deps);

    assert.equal(results.length, 1);
    assert.equal(results[0].status, "skipped_no_matching_user");
    assert.equal(results[0].resolved_subject_user_id, undefined);

    // No side effects: no upload, no email, no update
    assert.equal(uploads.length, 0);
    assert.equal(mails.length, 0);
    assert.equal(updates.length, 0);
  });

  it("email match is case-insensitive across pages of listUsers", async () => {
    // Two pages of 2 users each. Match is on page 2, mixed-case email.
    const admin = makeAdmin({
      authUsers: [
        { id: "u1", email: "a@example.com" },
        { id: "u2", email: "b@example.com" },
        { id: USER_ID, email: SUBJECT_EMAIL.toUpperCase() },
        { id: "u4", email: "c@example.com" },
      ],
      pageSize: 2,
    });

    const resolved = await resolveUserIdByEmail(admin, SUBJECT_EMAIL);
    assert.equal(resolved, USER_ID);
  });

  it("resolveUserIdByEmail returns null when email is empty", async () => {
    const admin = makeAdmin({});
    const resolved = await resolveUserIdByEmail(admin, "");
    assert.equal(resolved, null);
  });
});

describe("tallyResults", () => {
  it("counts every status bucket", () => {
    const t = tallyResults([
      { id: "1", status: "delivered" },
      { id: "2", status: "delivered", resolved_subject_user_id: "u2" },
      { id: "3", status: "skipped_no_matching_user" },
      { id: "4", status: "error", reason: "upload:disk full" },
      {
        id: "5",
        status: "error",
        reason: "sign:foo",
        resolved_subject_user_id: "u5",
      },
    ]);
    assert.deepEqual(t, {
      scanned: 5,
      delivered: 2,
      resolved: 2,
      skipped_no_user: 1,
      errors: 2,
    });
  });

  it("empty input -> all zeros", () => {
    assert.deepEqual(tallyResults([]), {
      scanned: 0,
      delivered: 0,
      resolved: 0,
      skipped_no_user: 0,
      errors: 0,
    });
  });
});
