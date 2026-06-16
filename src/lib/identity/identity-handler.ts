/**
 * Pure handlers for the identity verification routes:
 *   POST /api/m/identity/session        — start (or return existing) verification
 *   GET  /api/m/identity/session/[id]   — fetch status of the caller's session
 *   POST /api/m/webhooks/veriff         — ingest Veriff event/decision webhooks
 *
 * The route files resolve auth + build a thin Supabase/Veriff adapter; these
 * functions own the flag gate, ownership checks, and idempotency — so tests
 * drive them with a stubbed client (same convention as room-handler.ts).
 *
 * Idempotency rule: POST /session returns the caller's existing row whenever it
 * is in a non-terminal state (created/started/submitted/review/
 * resubmission_requested). Terminal states (approved/declined/expired/
 * abandoned) let the caller start a fresh session.
 */
import { NextResponse } from "next/server";
import {
  isIdentityStatus,
  statusFromPayload,
  type IdentityStatus,
} from "./webhook";

export type IdentityVerificationRow = {
  id: string;
  user_id: string;
  veriff_session_id: string;
  status: string;
  decision_json: unknown | null;
  vendor_data: string | null;
  verification_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CreatedVeriffSession = {
  id: string;
  url: string;
};

export type IdentityClient = {
  /** The caller's most recent verification row, if any. */
  getLatestForUser(userId: string): Promise<{
    data: IdentityVerificationRow | null;
    error: { message: string } | null;
  }>;
  /** A single verification row by id (ownership checked by the handler). */
  getById(id: string): Promise<{
    data: IdentityVerificationRow | null;
    error: { message: string } | null;
  }>;
  /** Look up a row by the Veriff session id (used by the webhook). */
  getBySessionId(sessionId: string): Promise<{
    data: IdentityVerificationRow | null;
    error: { message: string } | null;
  }>;
  createSession(input: {
    userId: string;
  }): Promise<CreatedVeriffSession>;
  insertRow(input: {
    userId: string;
    sessionId: string;
    verificationUrl: string;
    vendorData: string;
  }): Promise<{
    data: IdentityVerificationRow | null;
    error: { message: string } | null;
  }>;
  updateFromWebhook(input: {
    sessionId: string;
    status: IdentityStatus;
    decisionJson: unknown;
  }): Promise<{ error: { message: string } | null }>;
};

const FEATURE_DISABLED = { error: "feature disabled" } as const;

/** Non-terminal states keep the same session active (idempotent reuse). */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set<IdentityStatus>([
  "created",
  "started",
  "submitted",
  "review",
  "resubmission_requested",
]);

export type StartSessionInput = {
  user_id: string;
  flagEnabled: boolean;
  client: IdentityClient;
};

export async function handleStartSession(
  input: StartSessionInput,
): Promise<NextResponse> {
  const { user_id, flagEnabled, client } = input;

  if (!flagEnabled) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  // Idempotent: reuse an existing active session for this user.
  const latest = await client.getLatestForUser(user_id);
  if (latest.error) {
    return NextResponse.json(
      { error: "Failed to load verification" },
      { status: 500 },
    );
  }
  if (latest.data && ACTIVE_STATUSES.has(latest.data.status)) {
    return NextResponse.json(
      {
        sessionId: latest.data.veriff_session_id,
        verificationUrl: latest.data.verification_url,
        status: latest.data.status,
      },
      { status: 200 },
    );
  }

  let session: CreatedVeriffSession;
  try {
    session = await client.createSession({ userId: user_id });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create session";
    // Upstream Veriff failure → 502 Bad Gateway.
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const inserted = await client.insertRow({
    userId: user_id,
    sessionId: session.id,
    verificationUrl: session.url,
    vendorData: user_id,
  });
  if (inserted.error || !inserted.data) {
    return NextResponse.json(
      { error: "Failed to persist verification" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      sessionId: inserted.data.veriff_session_id,
      verificationUrl: inserted.data.verification_url,
      status: inserted.data.status,
    },
    { status: 201 },
  );
}

export type GetSessionInput = {
  user_id: string;
  id: string;
  flagEnabled: boolean;
  client: IdentityClient;
};

export async function handleGetSession(
  input: GetSessionInput,
): Promise<NextResponse> {
  const { user_id, id, flagEnabled, client } = input;

  if (!flagEnabled) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  const res = await client.getById(id);
  if (res.error) {
    return NextResponse.json(
      { error: "Failed to load verification" },
      { status: 500 },
    );
  }
  if (!res.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (res.data.user_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    {
      sessionId: res.data.veriff_session_id,
      status: res.data.status,
      verificationUrl: res.data.verification_url,
      decision: res.data.decision_json,
    },
    { status: 200 },
  );
}

export type WebhookInput = {
  /** Result of verifyVeriffSignature: signature validity + parsed payload. */
  valid: boolean;
  payload: unknown;
  client: IdentityClient;
};

/**
 * Webhook handler. Signature is verified by the route before calling this.
 *   - invalid signature → 401
 *   - unparseable / unknown-status / unknown-session payload → 200 (log only,
 *     so Veriff does not retry malformed or out-of-band events)
 *   - recognised event/decision → update the row, 200
 */
export async function handleWebhook(
  input: WebhookInput,
): Promise<NextResponse> {
  const { valid, payload, client } = input;

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const sessionId = sessionIdFromPayload(payload);
  if (!sessionId) {
    console.info("[veriff] webhook missing session id; ignoring");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const status = statusFromPayload(payload);
  if (!status || !isIdentityStatus(status)) {
    console.info(
      `[veriff] webhook for ${sessionId} has no actionable status; ignoring`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const existing = await client.getBySessionId(sessionId);
  if (existing.error) {
    // Transient DB error — let Veriff retry.
    return NextResponse.json(
      { error: "Failed to load verification" },
      { status: 500 },
    );
  }
  if (!existing.data) {
    console.info(`[veriff] webhook for unknown session ${sessionId}; ignoring`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const updated = await client.updateFromWebhook({
    sessionId,
    status,
    decisionJson: payload,
  });
  if (updated.error) {
    return NextResponse.json(
      { error: "Failed to update verification" },
      { status: 500 },
    );
  }

  console.info(`[veriff] webhook ${sessionId} -> ${status}`);
  return NextResponse.json({ received: true }, { status: 200 });
}

/** Pull the Veriff session id out of either webhook shape. */
function sessionIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as {
    id?: unknown;
    sessionId?: unknown;
    verification?: { id?: unknown };
  };
  if (typeof p.verification?.id === "string") return p.verification.id;
  if (typeof p.sessionId === "string") return p.sessionId;
  if (typeof p.id === "string") return p.id;
  return null;
}
