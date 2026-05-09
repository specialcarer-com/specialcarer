import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card, Button, Tag } from "../../_components/ui";
import { CARE_CATEGORY_LABEL } from "@/lib/org/booking-types";
import type { ServiceUser, CareCategory } from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Service users — SpecialCarer" };

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

  const { data: serviceUsers } = await admin
    .from("service_users")
    .select("*")
    .eq("organization_id", member.organization_id)
    .is("archived_at", null)
    .order("full_name");

  const canEdit = ["owner", "admin", "booker"].includes(member.role);

  return (
    <OrgShell
      title="Service users"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-subheading">
              {serviceUsers?.length ?? 0} active record
              {serviceUsers?.length !== 1 ? "s" : ""}
            </p>
          </div>
          {canEdit && (
            <Link href="/m/org/service-users/new">
              <Button size="sm">+ Add service user</Button>
            </Link>
          )}
        </div>

        {/* Empty state */}
        {(!serviceUsers || serviceUsers.length === 0) && (
          <Card className="p-6 text-center">
            <p className="text-[14px] font-bold text-heading mb-1">
              No service users yet
            </p>
            <p className="text-[12px] text-subheading mb-4">
              Add the people you&rsquo;ll be booking care for. Their details are
              kept private and only shared in anonymised form with assigned
              carers.
            </p>
            {canEdit && (
              <Link href="/m/org/service-users/new">
                <Button size="md" variant="ghost">
                  Add your first service user
                </Button>
              </Link>
            )}
          </Card>
        )}

        {/* List */}
        {serviceUsers?.map((su: ServiceUser) => (
          <Card key={su.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-heading truncate">
                  {su.full_name}
                </p>
                {su.dob && (
                  <p className="text-[12px] text-subheading mt-0.5">
                    DOB: {new Date(su.dob).toLocaleDateString("en-GB")}
                  </p>
                )}
                {su.city && (
                  <p className="text-[12px] text-subheading">{su.city}</p>
                )}
                {su.care_categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {su.care_categories.map((cat: CareCategory) => (
                      <Tag key={cat} tone="neutral">
                        {CARE_CATEGORY_LABEL[cat] ?? cat}
                      </Tag>
                    ))}
                  </div>
                )}
                {su.primary_contact_name && (
                  <p className="text-[12px] text-subheading mt-1.5">
                    Contact: {su.primary_contact_name}
                    {su.primary_contact_phone && ` · ${su.primary_contact_phone}`}
                  </p>
                )}
              </div>
              {canEdit && (
                <Link href={`/m/org/service-users/${su.id}/edit`}>
                  <Button size="sm" variant="outline">
                    Edit
                  </Button>
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </OrgShell>
  );
}
