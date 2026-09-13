/**
 * Organisation-invitation handler logic (Phase D — PR D1).
 *
 * All four routes (send, preview, accept, cancel) delegate to this
 * module so the routes stay wire-only and the handler logic is
 * testable with fake in-memory DBs. No I/O against Supabase happens
 * here directly — every call goes through the injected `InvitationsDb`
 * interface, which the routes wire to `createAdminClient()` and
 * `createClient()`.
 *
 * The DB abstraction is deliberately minimal (one method per query)
 * so a fake implementation for tests is a couple of dozen lines.
 *
 * Deploy-safe: every DB method returns `schemaNotReady: true` on PG
 * error codes `42P01` (undefined_table) / `42703` (undefined_column).
 * Handlers turn that into a 202 with `skippedReason:'schema_not_ready'`.
 */

import { generateToken, hashToken } from "./invitation-token";
import {
  logSafePayload,
  renderInvitationEmail,
} from "./invitation-email";
import type { InvitationEmailInput } from "./invitation-email";

// ---------------------------------------------------------------------------
// Domain types.
// ---------------------------------------------------------------------------

export type InvitationRole = "admin" | "booker" | "finance" | "viewer";

export const INVITATION_ROLES: readonly InvitationRole[] = [
  "admin",
  "booker",
  "finance",
  "viewer",
] as const;

/**
 * `finance` invites can be minted today, but `organization_members`'s
 * CHECK constraint doesn't accept `finance` until D2 broadens it. The
 * accept handler rejects `finance` explicitly with
 * `error: 'role_pending_d2'` so we never attempt an insert that would
 * fail against the CHECK.
 */
export const ROLES_ACCEPTED_INTO_MEMBERS: readonly InvitationRole[] = [
  "admin",
  "booker",
  "viewer",
] as const;

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: InvitationRole;
  invited_by: string;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
};

export type InvitationPreview = {
  orgName: string;
  inviterName: string;
  role: InvitationRole;
  expiresAt: string;
  alreadyAccepted: boolean;
  cancelled: boolean;
};

export type Actor = { id: string; email: string | null };

export type SchemaNotReady = { schemaNotReady: true };

function isSchemaNotReady<T>(x: T | SchemaNotReady): x is SchemaNotReady {
  return typeof x === "object" && x !== null && "schemaNotReady" in x;
}

// ---------------------------------------------------------------------------
// Injected surfaces (DB + email + clock + token gen).
// ---------------------------------------------------------------------------

export type OrgMemberRow = {
  organization_id: string;
  user_id: string;
  role: string;
};

export interface InvitationsDb {
  /** Is the actor an org admin (owner|admin role) on the given org? */
  isOrgAdmin(
    actorId: string,
    organizationId: string,
  ): Promise<{ ok: true; admin: boolean } | SchemaNotReady>;

  /** Existing member row for (org, user_id)? */
  memberExists(
    organizationId: string,
    userId: string,
  ): Promise<{ ok: true; exists: boolean } | SchemaNotReady>;

  /** Existing member row by lower-cased email in the given org? */
  memberExistsByEmail(
    organizationId: string,
    emailLower: string,
  ): Promise<{ ok: true; exists: boolean } | SchemaNotReady>;

  /** Is there already a pending (non-accepted, non-cancelled) invite for this email? */
  pendingInviteExists(
    organizationId: string,
    emailLower: string,
  ): Promise<{ ok: true; exists: boolean } | SchemaNotReady>;

  /** Insert a new invitation row, return the id. */
  insertInvitation(
    row: Omit<InvitationRow, "id" | "created_at" | "accepted_at" | "accepted_by" | "cancelled_at" | "cancelled_by">,
  ): Promise<{ ok: true; id: string } | SchemaNotReady>;

  /** Look up by token_hash; nulls if none. */
  findByTokenHash(
    tokenHash: string,
  ): Promise<{ ok: true; row: InvitationRow | null } | SchemaNotReady>;

  /** Fetch org display name (best-effort — falls back to org id if unavailable). */
  getOrgName(
    organizationId: string,
  ): Promise<{ ok: true; name: string } | SchemaNotReady>;

  /** Fetch inviter display name (best-effort). */
  getInviterName(
    userId: string,
  ): Promise<{ ok: true; name: string } | SchemaNotReady>;

  /**
   * Atomic accept RPC (invitation + member insert in one transaction).
   * Return `{ok:true, alreadyMember:false}` on success, `alreadyMember:true`
   * on unique-violation (23505) on organization_members.
   */
  acceptInvitationRpc(input: {
    invitation_id: string;
    user_id: string;
    organization_id: string;
    role: InvitationRole;
    full_name: string | null;
    work_email: string;
  }): Promise<
    | { ok: true; alreadyMember: false }
    | { ok: true; alreadyMember: true }
    | { ok: false; error: "not_acceptable_state" }
    | SchemaNotReady
  >;

  /** Cancel an invite by id, return whether the update happened. */
  cancelInvitation(input: {
    id: string;
    actorId: string;
    organizationId: string;
  }): Promise<
    { ok: true; cancelled: boolean; alreadyAccepted: boolean } | SchemaNotReady
  >;

  /** Fetch pending invitations owned by an id (for the cancel handler auth check). */
  findInvitationById(
    id: string,
  ): Promise<{ ok: true; row: InvitationRow | null } | SchemaNotReady>;

  /** Count pending invitations whose expiry is past now — cron observability. */
  countExpiredPending(
    now: Date,
  ): Promise<{ ok: true; count: number } | SchemaNotReady>;
}

export type EmailSender = (input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<{ ok: boolean; error?: string }>;

export type RateLimiter = (key: string) => Promise<{
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
  limit: number;
  resetAt: number;
}>;

export type Clock = () => Date;

export type TokenGen = () => { rawToken: string; tokenHash: string };

export type InvitationsDeps = {
  db: InvitationsDb;
  sendEmail: EmailSender;
  rateLimit: RateLimiter;
  clock?: Clock;
  tokenGen?: TokenGen;
  /** Base URL for the accept link — normally `NEXT_PUBLIC_APP_URL`. */
  appBaseUrl: string;
};

// ---------------------------------------------------------------------------
// send()
// ---------------------------------------------------------------------------

export type SendInput = {
  actor: Actor;
  organizationId: string;
  email: string;
  role: InvitationRole;
};

export type SendResult =
  | { status: 200; body: { ok: true; id: string } }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 401; body: { ok: false; error: "unauthenticated" } }
  | { status: 403; body: { ok: false; error: "forbidden" } }
  | {
      status: 400;
      body: {
        ok: false;
        error:
          | "invalid_email"
          | "invalid_role"
          | "invalid_organization_id";
      };
    }
  | { status: 409; body: { ok: false; error: "already_member" | "pending_invite_exists" } }
  | {
      status: 429;
      body: { ok: false; error: "rate_limited"; retryAfterSec: number };
    }
  | { status: 500; body: { ok: false; error: "send_failed" } };

function normEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  // Deliberately liberal — the send route is admin-authenticated so
  // the surface is trusted. Reject only clear garbage.
  if (trimmed.length < 3 || trimmed.length > 320) return null;
  if (!trimmed.includes("@")) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}

export async function handleSend(
  input: SendInput,
  deps: InvitationsDeps,
): Promise<SendResult> {
  if (!input.actor?.id) {
    return { status: 401, body: { ok: false, error: "unauthenticated" } };
  }
  if (
    typeof input.organizationId !== "string" ||
    input.organizationId.trim() === ""
  ) {
    return { status: 400, body: { ok: false, error: "invalid_organization_id" } };
  }
  const email = normEmail(input.email);
  if (!email) {
    return { status: 400, body: { ok: false, error: "invalid_email" } };
  }
  if (!INVITATION_ROLES.includes(input.role)) {
    return { status: 400, body: { ok: false, error: "invalid_role" } };
  }

  // Rate limit first — even schema_not_ready callers get counted so a
  // pre-migration attacker can't warm the limiter for free.
  const rl = await deps.rateLimit(input.organizationId);
  if (!rl.ok) {
    return {
      status: 429,
      body: {
        ok: false,
        error: "rate_limited",
        retryAfterSec: rl.retryAfterSec,
      },
    };
  }

  const adminCheck = await deps.db.isOrgAdmin(
    input.actor.id,
    input.organizationId,
  );
  if (isSchemaNotReady(adminCheck)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (!adminCheck.admin) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }

  const memberCheck = await deps.db.memberExistsByEmail(
    input.organizationId,
    email,
  );
  if (isSchemaNotReady(memberCheck)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (memberCheck.exists) {
    return { status: 409, body: { ok: false, error: "already_member" } };
  }

  const pendingCheck = await deps.db.pendingInviteExists(
    input.organizationId,
    email,
  );
  if (isSchemaNotReady(pendingCheck)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (pendingCheck.exists) {
    return {
      status: 409,
      body: { ok: false, error: "pending_invite_exists" },
    };
  }

  const now = (deps.clock ?? (() => new Date()))();
  const tokenPair = (deps.tokenGen ?? generateToken)();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const inserted = await deps.db.insertInvitation({
    organization_id: input.organizationId,
    email,
    role: input.role,
    invited_by: input.actor.id,
    token_hash: tokenPair.tokenHash,
    expires_at: expiresAt.toISOString(),
  });
  if (isSchemaNotReady(inserted)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }

  // Best-effort names for the email — a missing org name just falls
  // back to a generic label rather than blocking the send.
  const orgNameRes = await deps.db.getOrgName(input.organizationId);
  const orgName = isSchemaNotReady(orgNameRes)
    ? "your organisation"
    : orgNameRes.name;
  const inviterRes = await deps.db.getInviterName(input.actor.id);
  const inviterName = isSchemaNotReady(inviterRes)
    ? "an admin"
    : inviterRes.name;

  const acceptUrl = buildAcceptUrl(deps.appBaseUrl, tokenPair.rawToken);
  const emailInput: InvitationEmailInput = {
    orgName,
    inviterName,
    role: input.role,
    acceptUrl,
    expiresAt,
  };
  const rendered = renderInvitationEmail(emailInput);
  const sent = await deps.sendEmail({
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (!sent.ok) {
    // The row is inserted; the admin can re-send once transport is
    // healthy. Log a redacted payload for observability.
    console.warn(
      "[org-invite] email send failed",
      logSafePayload(emailInput),
      sent.error,
    );
    return { status: 500, body: { ok: false, error: "send_failed" } };
  }

  return { status: 200, body: { ok: true, id: inserted.id } };
}

export function buildAcceptUrl(baseUrl: string, rawToken: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/org/invitations/accept?token=${encodeURIComponent(rawToken)}`;
}

// ---------------------------------------------------------------------------
// preview() — GET /api/invitations/[token]
// ---------------------------------------------------------------------------

export type PreviewInput = { rawToken: string };

export type PreviewResult =
  | { status: 200; body: { ok: true; preview: InvitationPreview } }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 400; body: { ok: false; error: "invalid_token" } }
  | { status: 404; body: { ok: false; error: "not_found" } }
  | { status: 409; body: { ok: false; error: "cancelled" } }
  | { status: 410; body: { ok: false; error: "expired" } };

export async function handlePreview(
  input: PreviewInput,
  deps: InvitationsDeps,
): Promise<PreviewResult> {
  if (typeof input.rawToken !== "string" || input.rawToken.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_token" } };
  }
  const tokenHash = hashToken(input.rawToken);
  const found = await deps.db.findByTokenHash(tokenHash);
  if (isSchemaNotReady(found)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (!found.row) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const row = found.row;
  if (row.cancelled_at !== null) {
    return { status: 409, body: { ok: false, error: "cancelled" } };
  }
  const now = (deps.clock ?? (() => new Date()))();
  if (row.accepted_at === null && new Date(row.expires_at) < now) {
    return { status: 410, body: { ok: false, error: "expired" } };
  }
  const orgNameRes = await deps.db.getOrgName(row.organization_id);
  const orgName = isSchemaNotReady(orgNameRes)
    ? row.organization_id
    : orgNameRes.name;
  const inviterRes = await deps.db.getInviterName(row.invited_by);
  const inviterName = isSchemaNotReady(inviterRes)
    ? "an admin"
    : inviterRes.name;

  return {
    status: 200,
    body: {
      ok: true,
      preview: {
        orgName,
        inviterName,
        role: row.role,
        expiresAt: row.expires_at,
        alreadyAccepted: row.accepted_at !== null,
        cancelled: false,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// accept() — POST /api/invitations/[token]/accept
// ---------------------------------------------------------------------------

export type AcceptInput = { rawToken: string; actor: Actor };

export type AcceptResult =
  | {
      status: 200;
      body: { ok: true; orgId: string; role: InvitationRole };
    }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 400; body: { ok: false; error: "invalid_token" } }
  | { status: 401; body: { ok: false; error: "unauthenticated" } }
  | {
      status: 403;
      body: { ok: false; error: "email_mismatch" };
    }
  | { status: 404; body: { ok: false; error: "not_found" } }
  | {
      status: 409;
      body: {
        ok: false;
        error:
          | "cancelled"
          | "already_accepted"
          | "already_member"
          | "role_pending_d2";
      };
    }
  | { status: 410; body: { ok: false; error: "expired" } }
  | { status: 500; body: { ok: false; error: "accept_failed" } };

export async function handleAccept(
  input: AcceptInput,
  deps: InvitationsDeps,
): Promise<AcceptResult> {
  if (!input.actor?.id) {
    return { status: 401, body: { ok: false, error: "unauthenticated" } };
  }
  if (typeof input.rawToken !== "string" || input.rawToken.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_token" } };
  }
  const tokenHash = hashToken(input.rawToken);
  const found = await deps.db.findByTokenHash(tokenHash);
  if (isSchemaNotReady(found)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (!found.row) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const row = found.row;
  if (row.cancelled_at !== null) {
    return { status: 409, body: { ok: false, error: "cancelled" } };
  }
  if (row.accepted_at !== null) {
    return { status: 409, body: { ok: false, error: "already_accepted" } };
  }
  const now = (deps.clock ?? (() => new Date()))();
  if (new Date(row.expires_at) < now) {
    return { status: 410, body: { ok: false, error: "expired" } };
  }
  const actorEmail = (input.actor.email ?? "").trim().toLowerCase();
  if (actorEmail === "" || actorEmail !== row.email) {
    return { status: 403, body: { ok: false, error: "email_mismatch" } };
  }
  // D1 hand-off to D2: `finance` role isn't in
  // organization_members.role CHECK yet. Reject explicitly so the RPC
  // insert doesn't fail against the CHECK.
  if (!ROLES_ACCEPTED_INTO_MEMBERS.includes(row.role)) {
    return { status: 409, body: { ok: false, error: "role_pending_d2" } };
  }

  const memberCheck = await deps.db.memberExists(
    row.organization_id,
    input.actor.id,
  );
  if (isSchemaNotReady(memberCheck)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (memberCheck.exists) {
    return { status: 409, body: { ok: false, error: "already_member" } };
  }

  const accepted = await deps.db.acceptInvitationRpc({
    invitation_id: row.id,
    user_id: input.actor.id,
    organization_id: row.organization_id,
    role: row.role,
    full_name: null,
    work_email: row.email,
  });
  if (isSchemaNotReady(accepted)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (accepted.ok === false) {
    // Race: someone else accepted or cancelled between our check and the RPC.
    return { status: 409, body: { ok: false, error: "already_accepted" } };
  }
  if (accepted.alreadyMember) {
    return { status: 409, body: { ok: false, error: "already_member" } };
  }
  return {
    status: 200,
    body: { ok: true, orgId: row.organization_id, role: row.role },
  };
}

// ---------------------------------------------------------------------------
// cancel() — POST /api/m/org/invitations/[id]/cancel
// ---------------------------------------------------------------------------

export type CancelInput = { actor: Actor; invitationId: string };

export type CancelResult =
  | { status: 200; body: { ok: true } }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } }
  | { status: 400; body: { ok: false; error: "invalid_id" } }
  | { status: 401; body: { ok: false; error: "unauthenticated" } }
  | { status: 403; body: { ok: false; error: "forbidden" } }
  | { status: 404; body: { ok: false; error: "not_found" } }
  | { status: 409; body: { ok: false; error: "already_accepted" } };

export async function handleCancel(
  input: CancelInput,
  deps: InvitationsDeps,
): Promise<CancelResult> {
  if (!input.actor?.id) {
    return { status: 401, body: { ok: false, error: "unauthenticated" } };
  }
  if (typeof input.invitationId !== "string" || input.invitationId.trim() === "") {
    return { status: 400, body: { ok: false, error: "invalid_id" } };
  }
  const found = await deps.db.findInvitationById(input.invitationId);
  if (isSchemaNotReady(found)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (!found.row) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }
  const row = found.row;
  const adminCheck = await deps.db.isOrgAdmin(
    input.actor.id,
    row.organization_id,
  );
  if (isSchemaNotReady(adminCheck)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (!adminCheck.admin) {
    return { status: 403, body: { ok: false, error: "forbidden" } };
  }
  if (row.accepted_at !== null) {
    return { status: 409, body: { ok: false, error: "already_accepted" } };
  }
  const cancelled = await deps.db.cancelInvitation({
    id: input.invitationId,
    actorId: input.actor.id,
    organizationId: row.organization_id,
  });
  if (isSchemaNotReady(cancelled)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  if (cancelled.alreadyAccepted) {
    return { status: 409, body: { ok: false, error: "already_accepted" } };
  }
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
// cron count-and-log
// ---------------------------------------------------------------------------

export type ExpireResult =
  | { status: 200; body: { ok: true; expiredCount: number } }
  | { status: 202; body: { ok: true; skippedReason: "schema_not_ready" } };

export async function handleExpireCron(
  deps: Pick<InvitationsDeps, "db" | "clock">,
): Promise<ExpireResult> {
  const now = (deps.clock ?? (() => new Date()))();
  const res = await deps.db.countExpiredPending(now);
  if (isSchemaNotReady(res)) {
    return {
      status: 202,
      body: { ok: true, skippedReason: "schema_not_ready" },
    };
  }
  return { status: 200, body: { ok: true, expiredCount: res.count } };
}
