import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../../../_components/OrgShell";
import ServiceUserForm from "../../_components/ServiceUserForm";
import type { ServiceUser } from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";

export default async function EditServiceUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/org/service-users/${id}/edit`);

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  if (!["owner", "admin", "booker"].includes(member.role)) {
    redirect("/m/org/service-users");
  }

  const { data: su } = await admin
    .from("service_users")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organization_id)
    .is("archived_at", null)
    .maybeSingle();

  if (!su) redirect("/m/org/service-users");

  return (
    <OrgShell
      title="Edit service user"
      back="/m/org/service-users"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <ServiceUserForm mode="edit" serviceUser={su as ServiceUser} />
    </OrgShell>
  );
}
