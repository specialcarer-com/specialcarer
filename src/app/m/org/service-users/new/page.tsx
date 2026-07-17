import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../../_components/OrgShell";
import ServiceUserForm from "../_components/ServiceUserForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add service user — SpecialCarer" };

export default async function NewServiceUserPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/service-users/new");

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  if (!["owner", "admin", "booker"].includes(member.role)) {
    redirect("/m/org/service-users");
  }

  return (
    <OrgShell
      title="Add service user"
      back="/m/org/service-users"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <ServiceUserForm mode="create" />
    </OrgShell>
  );
}
