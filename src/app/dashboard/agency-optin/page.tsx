import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGatesForUser, isUkCarer } from "@/lib/agency-optin/server";
import AgencyOptInClient from "./AgencyOptInClient";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Agency opt-in — SpecialCarer",
};

export default async function AgencyOptInPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/agency-optin");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country, full_name, agency_opt_in_status, agency_opt_in_rejected_reason, agency_opt_in_paused_reason")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      country: string | null;
      full_name: string | null;
      agency_opt_in_status: string;
      agency_opt_in_rejected_reason: string | null;
      agency_opt_in_paused_reason: string | null;
    }>();
  if (!profile || profile.role !== "caregiver") {
    redirect("/dashboard");
  }

  const ukEligible = isUkCarer(profile.country);

  if (!ukEligible) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
          <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Agency opt-in
          </h1>
          <p className="text-slate-700">
            Agency shifts (Channel B) are <strong>available in UK only</strong> for now.
            Your account is registered in {profile.country ?? "US"}; this option will become
            available in your market in a future phase.
          </p>
          <div className="mt-6">
            <Link href="/dashboard" className="text-brand font-semibold underline">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const gates = await getGatesForUser(admin, user.id);

  return (
    <AgencyOptInClient
      initialStatus={profile.agency_opt_in_status}
      initialGates={gates}
      rejectedReason={profile.agency_opt_in_rejected_reason}
      pausedReason={profile.agency_opt_in_paused_reason}
      fullName={profile.full_name ?? ""}
    />
  );
}
