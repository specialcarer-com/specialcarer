import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function OrgBillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/billing");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  const { data: billing } = await admin
    .from("organization_billing")
    .select(
      "billing_contact_name, billing_contact_email, billing_address, po_required, po_mode, default_terms",
    )
    .eq("organization_id", org.id)
    .maybeSingle<{
      billing_contact_name: string | null;
      billing_contact_email: string | null;
      billing_address: Record<string, string> | null;
      po_required: boolean;
      po_mode: string | null;
      default_terms: string;
    }>();

  return (
    <OrgShell
      title="Billing"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <Card className="p-4 space-y-3">
        <Field
          label="Billing contact"
          value={billing?.billing_contact_name ?? null}
        />
        <Field label="Email" value={billing?.billing_contact_email ?? null} />
        <Field
          label="Address"
          value={
            billing?.billing_address
              ? [
                  billing.billing_address.line1,
                  billing.billing_address.line2,
                  billing.billing_address.city,
                  billing.billing_address.postcode,
                ]
                  .filter(Boolean)
                  .join(", ")
              : "Same as office address"
          }
        />
        <Field
          label="Purchase Order"
          value={
            billing?.po_required
              ? `Required · ${billing.po_mode ?? "tbd"}`
              : "Not required"
          }
        />
        <Field
          label="Default terms"
          value={(billing?.default_terms ?? "net_14").replace("_", " ")}
        />
      </Card>
      <Card className="p-4 mt-3">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Payment method
        </p>
        <p className="mt-1 text-[13px] text-heading">
          Bank-on-file for Stripe Invoicing comes online with Phase B (org
          booking flow). For now we capture your terms and your billing
          contact only — no card stored.
        </p>
      </Card>
      <p className="mt-4 text-center text-[12px]">
        <Link
          href="/m/org/register/step-6"
          className="text-primary font-semibold"
        >
          Edit billing details
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
      <p className="text-[14px] text-heading mt-0.5">{value ?? "—"}</p>
    </div>
  );
}
