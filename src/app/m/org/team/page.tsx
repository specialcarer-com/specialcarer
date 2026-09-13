import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";
import TeamManager, {
  type UIInvitation,
  type UIMember,
  type UIRole,
} from "./_components/TeamManager";

export const dynamic = "force-dynamic";

type MemberFromDb = {
  id: string;
  user_id: string;
  full_name: string | null;
  work_email: string | null;
  is_signatory: boolean;
  role: string;
  created_at: string;
};

type InvitationFromDb = {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
};

function isRole(v: string): v is UIRole {
  return (
    v === "owner" ||
    v === "admin" ||
    v === "booker" ||
    v === "finance" ||
    v === "viewer"
  );
}

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ORG_INVITATIONS_ENABLED === "true";
}

export default async function OrgTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/team");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  // Members list — deploy-safe: if the query errors (schema drift,
  // whatever) we render an empty list rather than blowing up the page.
  let members: UIMember[] = [];
  try {
    const { data: rows } = await admin
      .from("organization_members")
      .select(
        "id, user_id, full_name, work_email, is_signatory, role, created_at",
      )
      .eq("organization_id", org.id);
    members = ((rows ?? []) as MemberFromDb[])
      .map((r) => {
        if (!isRole(r.role)) return null;
        const m: UIMember = {
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          full_name: r.full_name,
          work_email: r.work_email,
          is_signatory: r.is_signatory,
          created_at: r.created_at,
        };
        return m;
      })
      .filter((r): r is UIMember => r !== null);
  } catch {
    members = [];
  }

  const canManage =
    isRole(member.role) && (member.role === "owner" || member.role === "admin");

  // Pending invitations — only shown to admins, and only when the
  // feature flag is on (D1's table may not exist in this env yet).
  let pendingInvitations: UIInvitation[] = [];
  if (canManage && featureEnabled()) {
    try {
      const { data: invRows } = await admin
        .from("organization_invitations")
        .select(
          "id, email, role, invited_by, created_at, expires_at, accepted_at, cancelled_at",
        )
        .eq("organization_id", org.id)
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false });
      pendingInvitations = ((invRows ?? []) as InvitationFromDb[])
        .filter((r) => new Date(r.expires_at).getTime() > Date.now())
        .map((r) => {
          if (!isRole(r.role)) return null;
          const inv: UIInvitation = {
            id: r.id,
            email: r.email,
            role: r.role,
            invited_by: r.invited_by,
            created_at: r.created_at,
            expires_at: r.expires_at,
          };
          return inv;
        })
        .filter((r): r is UIInvitation => r !== null);
    } catch {
      pendingInvitations = [];
    }
  }

  return (
    <OrgShell
      title="Team"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      {!featureEnabled() ? (
        <>
          <Card className="p-4">
            <p className="text-[14px] font-bold text-heading">
              Multi-seat coming soon
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              Add team-mates with their own logins, with booker / finance /
              admin / viewer roles. Until then, every booking captures the
              staff member&rsquo;s name + role + email so the migration is
              lossless.
            </p>
          </Card>
          <ReadOnlyMembers members={members} />
        </>
      ) : (
        <TeamManager
          members={members}
          pendingInvitations={pendingInvitations}
          currentUserId={user.id}
          canManage={canManage}
        />
      )}
    </OrgShell>
  );
}

function ReadOnlyMembers({ members }: { members: UIMember[] }) {
  return (
    <Card className="p-4 mt-3">
      <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
        Members ({members.length})
      </p>
      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-heading truncate">
                {m.full_name ?? "—"}
                {m.is_signatory && " · signatory"}
              </p>
              <p className="text-[12px] text-subheading truncate">
                {m.work_email ?? "—"}
              </p>
            </div>
            <span className="text-[12px] text-subheading uppercase">
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
