import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUkCarer } from "@/lib/agency-optin/server";
import DbsChoiceClient from "./DbsChoiceClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "DBS — Agency opt-in" };

export default async function DbsChoicePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/agency-optin/dbs");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country, full_name")
    .eq("id", user.id)
    .maybeSingle<{
      role: string;
      country: string | null;
      full_name: string | null;
    }>();
  if (!profile || profile.role !== "caregiver") redirect("/dashboard");
  if (!isUkCarer(profile.country)) redirect("/dashboard/agency-optin");

  return (
    <div className="max-w-3xl mx-auto p-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Link href="/dashboard/agency-optin" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to agency opt-in
      </Link>
      <div className="mt-3 bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Enhanced DBS</h1>
        <p className="text-slate-600 mb-6">
          We need a current Enhanced DBS with the children's and adults' barred
          lists. You have two ways to satisfy this gate.
        </p>
        <DbsChoiceClient defaultLegalName={profile.full_name ?? ""} />
      </div>
    </div>
  );
}
