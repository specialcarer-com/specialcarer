/**
 * Supabase-backed adapter for `MembersDb` (Phase D — PR D2).
 *
 * Bridges the pure handler layer in `members.ts` to the real
 * `createAdminClient()`. Same deploy-safe fallback pattern as
 * `invitations-db.ts`: PG error codes 42P01 / 42703 → `{schemaNotReady: true}`.
 *
 * All writes go through the service-role admin client — the audit
 * table has no INSERT policies, so this is the only path that can
 * append audit rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrgRole, type OrgRole } from "./authz";
import type { AuditRow, MemberRow, MembersDb, SchemaNotReady } from "./members";

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

function coerceRole(raw: unknown): OrgRole | null {
  return isOrgRole(raw) ? (raw as OrgRole) : null;
}

export function makeSupabaseMembersDb(admin: AnyClient): MembersDb {
  return {
    async findMemberById(id) {
      const { data, error } = await admin
        .from("organization_members")
        .select(
          "id, user_id, organization_id, role, full_name, work_email, is_signatory, created_at",
        )
        .eq("id", id)
        .maybeSingle<{
          id: string;
          user_id: string;
          organization_id: string;
          role: string;
          full_name: string | null;
          work_email: string | null;
          is_signatory: boolean;
          created_at: string;
        }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, row: null };
      }
      if (!data) return { ok: true, row: null };
      const role = coerceRole(data.role);
      if (!role) {
        // A row whose role isn't a canonical OrgRole is treated as
        // "not found" from the handler's POV — the caller can't
        // safely act on an unknown role and this way we don't crash.
        return { ok: true, row: null };
      }
      const row: MemberRow = {
        id: data.id,
        user_id: data.user_id,
        organization_id: data.organization_id,
        role,
        full_name: data.full_name,
        work_email: data.work_email,
        is_signatory: data.is_signatory,
        created_at: data.created_at,
      };
      return { ok: true, row };
    },

    async findMyRole(userId, organizationId) {
      const { data, error } = await admin
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle<{ role: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, role: null };
      }
      const role = coerceRole(data?.role);
      return { ok: true, role };
    },

    async updateMemberRole({ id, role }) {
      const { data, error } = await admin
        .from("organization_members")
        .update({ role })
        .eq("id", id)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        throw error;
      }
      return { ok: true, updated: Boolean(data) };
    },

    async deleteMember({ id }) {
      const { data, error } = await admin
        .from("organization_members")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        throw error;
      }
      return { ok: true, deleted: Boolean(data) };
    },

    async listMembers(organizationId) {
      const { data, error } = await admin
        .from("organization_members")
        .select(
          "id, user_id, organization_id, role, full_name, work_email, is_signatory, created_at",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, rows: [] };
      }
      const rows: MemberRow[] = ((data ?? []) as Array<{
        id: string;
        user_id: string;
        organization_id: string;
        role: string;
        full_name: string | null;
        work_email: string | null;
        is_signatory: boolean;
        created_at: string;
      }>)
        .map((r) => {
          const role = coerceRole(r.role);
          if (!role) return null;
          const row: MemberRow = {
            id: r.id,
            user_id: r.user_id,
            organization_id: r.organization_id,
            role,
            full_name: r.full_name,
            work_email: r.work_email,
            is_signatory: r.is_signatory,
            created_at: r.created_at,
          };
          return row;
        })
        .filter((r): r is MemberRow => r !== null);
      return { ok: true, rows };
    },

    async countOrgAdmins(organizationId) {
      const { count, error } = await admin
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("role", ["owner", "admin"]);
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) return schemaNotReady();
        return { ok: true, count: 0 };
      }
      return { ok: true, count: count ?? 0 };
    },

    async insertAudit(row: AuditRow) {
      const { error } = await admin.from("org_membership_audit").insert({
        organization_id: row.organization_id,
        actor_user_id: row.actor_user_id,
        target_user_id: row.target_user_id,
        action: row.action,
        from_role: row.from_role,
        to_role: row.to_role,
        metadata: row.metadata,
      });
      if (error) {
        if (isSchemaNotReadyError(error as PgError)) {
          // Deploy-safe: audit table not yet created — treat as a
          // best-effort success so the mutation isn't blocked.
          return { ok: true };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true };
    },
  };
}
