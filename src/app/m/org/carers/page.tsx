import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function OrgCarersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/carers");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  return (
    <OrgShell
      title="Browse carers"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4">
        <p className="text-[14px] font-bold text-heading">
          Browse open requests &amp; carers
        </p>
        <p className="mt-1 text-[12px] text-subheading">
          You can browse and shortlist while we verify. The full org-side
          booking flow lights up in Phase B.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href="/m/book/browse"
            className="rounded-card border border-line bg-white p-3 text-center text-[13px] font-semibold text-heading"
          >
            Find carers
          </Link>
          <Link
            href="/m/jobs"
            className="rounded-card border border-line bg-white p-3 text-center text-[13px] font-semibold text-heading"
          >
            See open jobs
          </Link>
        </div>
      </Card>
    </OrgShell>
  );
}
