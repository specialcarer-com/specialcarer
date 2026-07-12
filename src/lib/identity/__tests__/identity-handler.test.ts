/**
 * Tests for the identity verification handlers. Driven with a stubbed
 * IdentityClient (same convention as room-handler.test.ts) so no Supabase /
 * Veriff / next/headers machinery is pulled in.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleStartSession,
  handleGetSession,
  handleWebhook,
  type IdentityClient,
  type IdentityVerificationRow,
} from "../identity-handler";

const USER = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";
const ROW_ID = "11111111-1111-1111-1111-111111111111";
const SESSION = "sess-abc";

function row(overrides?: Partial<IdentityVerificationRow>): IdentityVerificationRow {
  return {
    id: ROW_ID,
    user_id: USER,
    veriff_session_id: SESSION,
    status: "created",
    decision_json: null,
    vendor_data: USER,
    verification_url: "https://magic.veriff.me/v/abc",
    created_at: "2026-06-16T10:00:00.000Z",
    updated_at: "2026-06-16T10:00:00.000Z",
    ...overrides,
  };
}

function client(overrides?: Partial<IdentityClient>): IdentityClient {
  const base: IdentityClient = {
    async getLatestForUser() {
      return { data: null, error: null };
    },
    async getById() {
      return { data: row(), error: null };
    },
    async getBySessionId() {
      return { data: row(), error: null };
    },
    async createSession() {
      return { id: SESSION, url: "https://magic.veriff.me/v/abc" };
    },
    async insertRow(input) {
      return {
        data: row({
          veriff_session_id: input.sessionId,
          verification_url: input.verificationUrl,
          vendor_data: input.vendorData,
        }),
        error: null,
      };
    },
    async updateFromWebhook() {
      return { error: null };
    },
  };
  return { ...base, ...overrides };
}

describe("handleStartSession", () => {
  it("returns 403 feature disabled when the flag is off", async () => {
    const res = await handleStartSession({
      user_id: USER,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "feature disabled",
    );
  });

  it("creates a new session (201) when the user has none", async () => {
    const res = await handleStartSession({
      user_id: USER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
      sessionId: string;
      verificationUrl: string;
    };
    assert.equal(body.sessionId, SESSION);
    assert.equal(body.verificationUrl, "https://magic.veriff.me/v/abc");
  });

  it("is idempotent: returns the existing active session (200) without creating", async () => {
    let created = false;
    const res = await handleStartSession({
      user_id: USER,
      flagEnabled: true,
      client: client({
        async getLatestForUser() {
          return { data: row({ status: "started" }), error: null };
        },
        async createSession() {
          created = true;
          return { id: "new", url: "new-url" };
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(created, false);
    const body = (await res.json()) as { sessionId: string };
    assert.equal(body.sessionId, SESSION);
  });

  it("starts a fresh session when the latest is in a terminal state", async () => {
    let created = false;
    const res = await handleStartSession({
      user_id: USER,
      flagEnabled: true,
      client: client({
        async getLatestForUser() {
          return { data: row({ status: "declined" }), error: null };
        },
        async createSession() {
          created = true;
          return { id: "new-sess", url: "new-url" };
        },
        async insertRow(input) {
          return { data: row({ veriff_session_id: input.sessionId }), error: null };
        },
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(created, true);
  });

  it("returns 502 when Veriff session creation fails", async () => {
    const res = await handleStartSession({
      user_id: USER,
      flagEnabled: true,
      client: client({
        async createSession() {
          throw new Error("upstream down");
        },
      }),
    });
    assert.equal(res.status, 502);
  });

  it("returns 500 when persisting the row fails", async () => {
    const res = await handleStartSession({
      user_id: USER,
      flagEnabled: true,
      client: client({
        async insertRow() {
          return { data: null, error: { message: "db down" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

describe("handleGetSession", () => {
  it("returns 403 when the flag is off", async () => {
    const res = await handleGetSession({
      user_id: USER,
      id: ROW_ID,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns the session status for the owner (200)", async () => {
    const res = await handleGetSession({
      user_id: USER,
      id: ROW_ID,
      flagEnabled: true,
      client: client({
        async getById() {
          return { data: row({ status: "approved" }), error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string };
    assert.equal(body.status, "approved");
  });

  it("returns 404 when the row does not exist", async () => {
    const res = await handleGetSession({
      user_id: USER,
      id: ROW_ID,
      flagEnabled: true,
      client: client({
        async getById() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 403 when the row belongs to a different user", async () => {
    const res = await handleGetSession({
      user_id: OTHER,
      id: ROW_ID,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });
});

describe("handleWebhook", () => {
  it("returns 401 when the signature is invalid", async () => {
    const res = await handleWebhook({
      valid: false,
      payload: { verification: { id: SESSION, status: "approved" } },
      client: client(),
    });
    assert.equal(res.status, 401);
  });

  it("updates the row + returns 200 for a recognised decision", async () => {
    let updatedStatus = "";
    const res = await handleWebhook({
      valid: true,
      payload: { verification: { id: SESSION, status: "approved" } },
      client: client({
        async updateFromWebhook(input) {
          updatedStatus = input.status;
          return { error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(updatedStatus, "approved");
  });

  it("maps an event-shaped payload (action + id) and updates", async () => {
    let updatedStatus = "";
    const res = await handleWebhook({
      valid: true,
      payload: { id: SESSION, action: "submitted" },
      client: client({
        async updateFromWebhook(input) {
          updatedStatus = input.status;
          return { error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(updatedStatus, "submitted");
  });

  it("returns 200 (log only) when the session id is missing", async () => {
    let updated = false;
    const res = await handleWebhook({
      valid: true,
      payload: { action: "submitted" },
      client: client({
        async updateFromWebhook() {
          updated = true;
          return { error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(updated, false);
  });

  it("returns 200 (log only) for an unknown status", async () => {
    const res = await handleWebhook({
      valid: true,
      payload: { id: SESSION, action: "some_future_action" },
      client: client(),
    });
    assert.equal(res.status, 200);
  });

  it("returns 200 (log only) for an unknown session", async () => {
    const res = await handleWebhook({
      valid: true,
      payload: { verification: { id: "unknown", status: "approved" } },
      client: client({
        async getBySessionId() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
  });

  it("returns 500 when the update fails (so Veriff retries)", async () => {
    const res = await handleWebhook({
      valid: true,
      payload: { verification: { id: SESSION, status: "approved" } },
      client: client({
        async updateFromWebhook() {
          return { error: { message: "db down" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});
