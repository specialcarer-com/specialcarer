import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function OrgBookingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/bookings");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  return (
    <OrgShell
      title="Bookings"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4">
        {org.verification_status === "verified" ? (
          <>
            <p className="text-[14px] font-bold text-heading">
              No bookings yet
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              Org-side bookings populate from Phase B. For now you can browse
              carers and post open requests.
            </p>
          </>
        ) : (
          <>
            <p className="text-[14px] font-bold text-heading">
              Booking opens once verified
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              We hold off on bookings until your documents are reviewed —
              this protects everyone, especially vulnerable service users.
            </p>
          </>
        )}
      </Card>
    </OrgShell>
  );
}
