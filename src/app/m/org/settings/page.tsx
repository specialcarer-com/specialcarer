import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/settings");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  return (
    <OrgShell
      title="Settings"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4 space-y-3">
        <Link
          href="/m/org/profile"
          className="block rounded-card border border-line bg-white p-3 text-[13px] font-semibold text-heading"
        >
          Edit organisation profile
        </Link>
        <Link
          href="/m/org/billing"
          className="block rounded-card border border-line bg-white p-3 text-[13px] font-semibold text-heading"
        >
          Billing details
        </Link>
        <Link
          href="/m/org/documents"
          className="block rounded-card border border-line bg-white p-3 text-[13px] font-semibold text-heading"
        >
          Documents
        </Link>
        <p className="text-[11px] text-subheading">
          More org-side preferences arrive with Phase B.
        </p>
      </Card>
    </OrgShell>
  );
}
