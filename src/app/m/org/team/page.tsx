import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Avatar, Card, Tag } from "../../_components/ui";

export const dynamic = "force-dynamic";

type Member = {
  id: string;
  user_id: string;
  full_name: string | null;
  job_title: string | null;
  job_title_other: string | null;
  work_email: string | null;
  is_signatory: boolean;
  role: string;
};

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

  const { data: rows } = await admin
    .from("organization_members")
    .select(
      "id, user_id, full_name, job_title, job_title_other, work_email, is_signatory, role",
    )
    .eq("organization_id", org.id);
  const members = (rows ?? []) as Member[];

  return (
    <OrgShell
      title="Team"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
          Members
        </p>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar
                name={(m.full_name ?? "?").slice(0, 1).toUpperCase()}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-heading truncate">
                  {m.full_name ?? "—"}
                </p>
                <p className="text-[12px] text-subheading truncate">
                  {(m.job_title === "Other" ? m.job_title_other : m.job_title) ??
                    "—"}
                  {m.is_signatory && " · signatory"}
                </p>
              </div>
              <Tag tone="primary">{m.role}</Tag>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-4 mt-3">
        <p className="text-[14px] font-bold text-heading">
          Multi-seat coming soon
        </p>
        <p className="mt-1 text-[12px] text-subheading">
          Add team-mates with their own logins, with booker / viewer / admin
          roles. Until then, every booking captures the staff member&rsquo;s
          name + role + email so the migration is lossless.
        </p>
      </Card>
    </OrgShell>
  );
}
