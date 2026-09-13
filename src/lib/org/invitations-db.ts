/**
 * Supabase-backed adapter for `InvitationsDb` (Phase D — PR D1).
 *
 * Bridges the pure handler layer in `invitations.ts` to the real
 * `createAdminClient()` — the route handlers are the only callers.
 *
 * All queries:
 *   - Catch PG error codes `42P01` (undefined_table) / `42703`
 *     (undefined_column) and translate to `{ schemaNotReady: true }`
 *     so the handler layer returns the deploy-safe 202 body. This is
 *     the same pattern used by DSAR + payout_alerts.
 *   - Never throw for expected paths (missing row → `null`, etc.).
 */

// Note: no `server-only` marker — keeps the module importable from
// node:test without a bundler polyfill. The functions here require a
// SupabaseClient instance from the caller; there are no module-level
// side effects and no service-role secret access outside the passed
// client. All real callers (route handlers, cron) wire this to
// createAdminClient() which itself is server-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InvitationRole,
  InvitationRow,
  InvitationsDb,
  SchemaNotReady,
} from "./invitations";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

type PgError = { code?: string; message?: string } | null | undefined;

function isSchemaNotReadyError(err: PgError): boolean {
  const code = err?.code;
  return code === "42P01" || code === "42703";
}

function schemaNotReady(): SchemaNotReady {
  return { schemaNotReady: true };
}

export function makeSupabaseInvitationsDb(admin: AnyClient): InvitationsDb {
  return {
    async isOrgAdmin(actorId, organizationId) {
      const { data, error } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", actorId)
        .maybeSingle<{ role: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, admin: false };
      }
      const role = data?.role ?? null;
      return { ok: true, admin: role === "owner" || role === "admin" };
    },

    async memberExists(organizationId, userId) {
      const { data, error } = await admin
        .from("organization_members")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle<{ id: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, exists: false };
      }
      return { ok: true, exists: Boolean(data) };
    },

    async memberExistsByEmail(organizationId, emailLower) {
      const { data, error } = await admin
        .from("organization_members")
        .select("id, work_email")
        .eq("organization_id", organizationId);
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, exists: false };
      }
      const rows = (data ?? []) as Array<{ id: string; work_email: string | null }>;
      const found = rows.some(
        (r) => (r.work_email ?? "").toLowerCase() === emailLower,
      );
      return { ok: true, exists: found };
    },

    async pendingInviteExists(organizationId, emailLower) {
      const { data, error } = await admin
        .from("organization_invitations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("email", emailLower)
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .limit(1);
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, exists: false };
      }
      return { ok: true, exists: (data ?? []).length > 0 };
    },

    async insertInvitation(row) {
      const { data, error } = await admin
        .from("organization_invitations")
        .insert({
          organization_id: row.organization_id,
          email: row.email,
          role: row.role,
          invited_by: row.invited_by,
          token_hash: row.token_hash,
          expires_at: row.expires_at,
        })
        .select("id")
        .single<{ id: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        throw error;
      }
      return { ok: true, id: data!.id };
    },

    async findByTokenHash(tokenHash) {
      const { data, error } = await admin
        .from("organization_invitations")
        .select(
          "id, organization_id, email, role, invited_by, token_hash, expires_at, accepted_at, accepted_by, cancelled_at, cancelled_by, created_at",
        )
        .eq("token_hash", tokenHash)
        .maybeSingle<InvitationRow>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, row: null };
      }
      return { ok: true, row: (data as InvitationRow | null) ?? null };
    },

    async findInvitationById(id) {
      const { data, error } = await admin
        .from("organization_invitations")
        .select(
          "id, organization_id, email, role, invited_by, token_hash, expires_at, accepted_at, accepted_by, cancelled_at, cancelled_by, created_at",
        )
        .eq("id", id)
        .maybeSingle<InvitationRow>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, row: null };
      }
      return { ok: true, row: (data as InvitationRow | null) ?? null };
    },

    async getOrgName(organizationId) {
      const { data, error } = await admin
        .from("organizations")
        .select("display_name, name, legal_name")
        .eq("id", organizationId)
        .maybeSingle<{ display_name?: string; name?: string; legal_name?: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, name: "your organisation" };
      }
      const name =
        data?.display_name ||
        data?.name ||
        data?.legal_name ||
        "your organisation";
      return { ok: true, name };
    },

    async getInviterName(userId) {
      const { data, error } = await admin
        .from("organization_members")
        .select("full_name")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ full_name: string | null }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, name: "an admin" };
      }
      const name = data?.full_name?.trim();
      return { ok: true, name: name && name.length > 0 ? name : "an admin" };
    },

    async acceptInvitationRpc(input) {
      const { error } = await admin.rpc("accept_organization_invitation", {
        p_invitation_id: input.invitation_id,
        p_user_id: input.user_id,
        p_organization_id: input.organization_id,
        p_role: input.role satisfies InvitationRole,
        p_full_name: input.full_name,
        p_work_email: input.work_email,
      });
      if (error) {
        const code = (error as PgError)?.code;
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        // PostgreSQL unique_violation on organization_members
        // (organization_id, user_id) → user is already a member.
        if (code === "23505") {
          return { ok: true, alreadyMember: true };
        }
        // The RPC raises check_violation (23514) when the invitation
        // is no longer in an acceptable state (race with another
        // accept or a cancel).
        if (code === "23514" || code === "P0001") {
          return { ok: false, error: "not_acceptable_state" };
        }
        throw error;
      }
      return { ok: true, alreadyMember: false };
    },

    async cancelInvitation({ id, actorId }) {
      // First re-read the row to distinguish "not accepted" from
      // "already accepted" without relying on the RETURNING shape of
      // the update.
      const pre = await admin
        .from("organization_invitations")
        .select("id, accepted_at, cancelled_at")
        .eq("id", id)
        .maybeSingle<{
          id: string;
          accepted_at: string | null;
          cancelled_at: string | null;
        }>();
      if (pre.error) {
        if (isSchemaNotReadyError(pre.error as PgError)) return schemaNotReady();
        return { ok: true, cancelled: false, alreadyAccepted: false };
      }
      const row = pre.data;
      if (!row) return { ok: true, cancelled: false, alreadyAccepted: false };
      if (row.accepted_at !== null) {
        return { ok: true, cancelled: false, alreadyAccepted: true };
      }
      if (row.cancelled_at !== null) {
        return { ok: true, cancelled: false, alreadyAccepted: false };
      }
      const { error } = await admin
        .from("organization_invitations")
        .update({
          cancelled_at: new Date().toISOString(),
          cancelled_by: actorId,
        })
        .eq("id", id)
        .is("accepted_at", null);
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, cancelled: false, alreadyAccepted: false };
      }
      return { ok: true, cancelled: true, alreadyAccepted: false };
    },

    async countExpiredPending(now) {
      const { count, error } = await admin
        .from("organization_invitations")
        .select("id", { count: "exact", head: true })
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .lt("expires_at", now.toISOString());
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, count: 0 };
      }
      return { ok: true, count: count ?? 0 };
    },
  };
}
