import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaregiverProfile, computeReadiness } from "@/lib/care/profile";
import ProfileEditor from "./editor";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Edit profile — SpecialCarer",
};

export default async function CaregiverProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/profile");

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from("profiles")
    .select("role, country, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileRow?.role !== "caregiver") {
    redirect("/dashboard");
  }

  const existing = await getCaregiverProfile(user.id);
  const readiness = await computeReadiness(user.id);

  // Auto-default display_name from profile.full_name if no caregiver_profile yet
  const initial = existing ?? {
    user_id: user.id,
    display_name: profileRow?.full_name ?? "",
    headline: "",
    bio: "",
    city: "",
    region: null,
    country: (profileRow?.country as "GB" | "US") ?? "GB",
    postcode: null,
    hide_precise_location: true,
    services: [],
    care_formats: [],
    hourly_rate_cents: null,
    weekly_rate_cents: null,
    currency:
      (profileRow?.country === "US" ? "USD" : "GBP") as "GBP" | "USD",
    years_experience: null,
    languages: [],
    max_radius_km: null,
    photo_url: null,
    is_published: false,
    rating_avg: null,
    rating_count: 0,
    gender: null,
    has_drivers_license: false,
    has_own_vehicle: false,
    tags: [],
    certifications: [],
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Dashboard
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Your caregiver profile</h1>
        <p className="mt-1 text-slate-600">
          Families can see this exactly as it appears here. Be specific — the more
          detail, the more bookings.
        </p>

        <ProfileEditor initial={initial} initialReadiness={readiness} />
      </section>
    </main>
  );
}
