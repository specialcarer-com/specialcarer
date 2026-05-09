import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function OrgServiceUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/service-users");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");
  return (
    <OrgShell
      title="Service users"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4">
        <p className="text-[14px] font-bold text-heading">
          Service users — Phase B
        </p>
        <p className="mt-1 text-[12px] text-subheading">
          A redacted register of the people you book care for: initials,
          care needs, access notes, primary contact. RLS-scoped to your
          organisation. Lights up in the next build.
        </p>
      </Card>
    </OrgShell>
  );
}
