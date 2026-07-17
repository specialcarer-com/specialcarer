import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../../_components/OrgShell";
import BookingWizard from "./_components/BookingWizard";
import type { ServiceUser } from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "New booking — SpecialCarer" };

export default async function NewBookingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/bookings/new");

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  if (!org.booking_enabled) {
    redirect("/m/org/bookings");
  }

  if (!["owner", "admin", "booker"].includes(member.role)) {
    redirect("/m/org/bookings");
  }

  // Load service users for step 1 picker
  const { data: serviceUsers } = await admin
    .from("service_users")
    .select("id, full_name, care_categories, dob, city")
    .eq("organization_id", member.organization_id)
    .is("archived_at", null)
    .order("full_name");

  return (
    <OrgShell
      title="New booking"
      back="/m/org/bookings"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <BookingWizard
        serviceUsers={(serviceUsers ?? []) as ServiceUser[]}
        bookerName={member.full_name ?? ""}
        bookerRole={member.job_title ?? ""}
      />
    </OrgShell>
  );
}
