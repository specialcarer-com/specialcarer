import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import CaregiverCard, { type CaregiverCardData } from "@/components/caregiver-card";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Saved caregivers — SpecialCarer",
};

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/account/saved");

  const { data: saved } = await supabase
    .from("saved_caregivers")
    .select("caregiver_id, created_at")
    .eq("seeker_id", user.id)
    .order("created_at", { ascending: false });

  const caregiverIds = (saved ?? []).map((s) => s.caregiver_id);
  const admin = createAdminClient();

  let cards: CaregiverCardData[] = [];
  if (caregiverIds.length > 0) {
    const { data: profiles } = await admin
      .from("caregiver_profiles")
      .select(
        "user_id, display_name, headline, bio, city, region, country, services, care_formats, hourly_rate_cents, weekly_rate_cents, currency, years_experience, languages, rating_avg, rating_count, is_published",
      )
      .in("user_id", caregiverIds);

    cards = (profiles ?? [])
      .filter((p) => p.is_published)
      .map((p) => ({
        user_id: p.user_id,
        display_name: p.display_name,
        headline: p.headline,
        bio: p.bio,
        city: p.city,
        region: p.region,
        country: (p.country as "GB" | "US") ?? "GB",
        services: p.services ?? [],
        care_formats: p.care_formats ?? [],
        hourly_rate_cents: p.hourly_rate_cents,
        weekly_rate_cents: p.weekly_rate_cents,
        currency: (p.currency as "GBP" | "USD" | null) ?? null,
        years_experience: p.years_experience,
        languages: p.languages ?? [],
        rating_avg: p.rating_avg ? Number(p.rating_avg) : null,
        rating_count: p.rating_count ?? 0,
      }));
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Saved caregivers</h1>
        <p className="mt-2 text-slate-600">
          People you&rsquo;ve bookmarked. Tap one to view the profile or book.
        </p>

        {cards.length === 0 ? (
          <div className="mt-10 p-8 rounded-2xl bg-white border border-slate-100 text-center">
            <p className="text-slate-700">No saved caregivers yet.</p>
            <Link
              href="/find-care"
              className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
            >
              Browse caregivers
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((c) => (
              <CaregiverCard key={c.user_id} c={c} bookable />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
