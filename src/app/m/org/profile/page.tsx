import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function OrgProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/profile");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  const addr = org.office_address;

  return (
    <OrgShell
      title="Profile"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4 space-y-3">
        <Field label="Legal name" value={org.legal_name} />
        <Field label="Trading name" value={org.trading_name} />
        <Field label="Country" value={org.country} />
        <Field label="Type" value={org.org_type} />
        <Field label="Size" value={org.size_band} />
        <Field
          label="Office address"
          value={
            addr
              ? [addr.line1, addr.line2, addr.city, addr.postcode]
                  .filter(Boolean)
                  .join(", ")
              : null
          }
        />
        <Field label="Website" value={org.website} />
        <Field
          label="Companies House / EIN"
          value={org.companies_house_number ?? org.ein}
        />
        <Field label="VAT" value={org.vat_number} />
      </Card>
      <p className="mt-4 text-center text-[12px]">
        <Link
          href="/m/org/register/step-3"
          className="text-primary font-semibold"
        >
          Edit organisation details
        </Link>
      </p>
    </OrgShell>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-t border-line first:border-t-0 first:pt-0 pt-2">
      <p className="text-[11px] uppercase tracking-wide text-subheading">
        {label}
      </p>
      <p className="text-[14px] text-heading mt-0.5">
        {value ?? "—"}
      </p>
    </div>
  );
}
