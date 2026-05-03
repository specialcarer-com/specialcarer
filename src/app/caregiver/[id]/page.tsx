import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCaregiverProfile } from "@/lib/care/profile";
import { formatMoney, serviceLabel } from "@/lib/care/services";
import MarketingShell from "@/components/marketing-shell";
import SaveButton from "./save-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getCaregiverProfile(id);
  if (!profile || !profile.is_published) {
    return { title: "Caregiver — SpecialCarer" };
  }
  const country = profile.country === "GB" ? "UK" : "US";
  return {
    title: `${profile.display_name ?? "Caregiver"} — ${profile.city ?? country} caregiver | SpecialCarer`,
    description:
      profile.headline ||
      profile.bio?.slice(0, 160) ||
      "Verified, background-checked caregiver on SpecialCarer.",
    alternates: { canonical: `/caregiver/${id}` },
  };
}

function initials(name: string | null | undefined) {
  if (!name) return "C";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default async function CaregiverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCaregiverProfile(id);
  if (!profile || !profile.is_published) notFound();

  const admin = createAdminClient();

  // Fetch reviews + reviewer names
  const { data: reviews } = await admin
    .from("reviews")
    .select("id, rating, body, created_at, reviewer_id")
    .eq("caregiver_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const reviewerIds = Array.from(new Set((reviews ?? []).map((r) => r.reviewer_id)));
  const { data: reviewers } = reviewerIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", reviewerIds)
    : { data: [] };
  const nameById = new Map((reviewers ?? []).map((p) => [p.id, p.full_name]));

  // Determine viewer + saved state
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let initiallySaved = false;
  if (user) {
    const { data } = await supabase
      .from("saved_caregivers")
      .select("caregiver_id")
      .eq("seeker_id", user.id)
      .eq("caregiver_id", id)
      .maybeSingle();
    initiallySaved = !!data;
  }

  const country = profile.country === "GB" ? "UK" : "US";
  const rate =
    profile.hourly_rate_cents != null && profile.currency
      ? `${formatMoney(profile.hourly_rate_cents, profile.currency)}/hr`
      : "Rate on request";

  return (
    <MarketingShell>
      <article className="max-w-4xl mx-auto px-6 py-12">
        <nav className="text-sm text-slate-500 mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-slate-700">
            Home
          </Link>
          <span>›</span>
          <Link href="/find-care" className="hover:text-slate-700">
            Find care
          </Link>
          <span>›</span>
          <span className="text-slate-900 font-medium">
            {profile.display_name ?? "Caregiver"}
          </span>
        </nav>

        <header className="flex flex-col sm:flex-row sm:items-start gap-6">
          {profile.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo_url}
              alt={profile.display_name ?? "Caregiver"}
              className="w-32 h-32 rounded-full object-cover bg-brand-50 flex-none"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-semibold text-3xl flex-none">
              {initials(profile.display_name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                  {profile.display_name ?? "Caregiver"}
                </h1>
                {profile.headline && (
                  <p className="mt-1 text-slate-600">{profile.headline}</p>
                )}
                <p className="mt-1 text-sm text-slate-500">
                  {[profile.city, country].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="text-right flex-none">
                <div className="text-2xl font-semibold text-slate-900">{rate}</div>
                {profile.rating_count > 0 && profile.rating_avg != null && (
                  <div className="mt-1 text-sm text-slate-600">
                    ★ {profile.rating_avg.toFixed(1)} ({profile.rating_count})
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={user ? `/book/${profile.user_id}` : `/login?redirectTo=/book/${profile.user_id}`}
                className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
              >
                {user ? "Book this caregiver" : "Sign in to book"}
              </Link>
              {user && (
                <SaveButton
                  caregiverId={profile.user_id}
                  initiallySaved={initiallySaved}
                />
              )}
            </div>
          </div>
        </header>

        <section className="mt-10 grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-8">
            <div>
              <h2 className="text-lg font-semibold">About</h2>
              <p className="mt-2 text-slate-700 whitespace-pre-line">
                {profile.bio ?? "No bio yet."}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Reviews</h2>
              {(reviews?.length ?? 0) === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  No reviews yet — be among the first to book.
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {(reviews ?? []).map((r) => (
                    <li
                      key={r.id}
                      className="p-4 rounded-2xl border border-slate-100 bg-white"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900">
                          {nameById.get(r.reviewer_id) ?? "Verified family"}
                        </span>
                        <span className="text-amber-500 text-sm">
                          {"★".repeat(r.rating)}
                          <span className="text-slate-300">
                            {"★".repeat(5 - r.rating)}
                          </span>
                        </span>
                      </div>
                      {r.body && (
                        <p className="mt-2 text-sm text-slate-700">{r.body}</p>
                      )}
                      <p className="mt-2 text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="space-y-5">
            <div className="p-5 rounded-2xl border border-slate-100 bg-white">
              <h3 className="font-semibold text-slate-900">Services</h3>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {profile.services.map((s) => (
                  <li
                    key={s}
                    className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium"
                  >
                    {serviceLabel(s)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5 rounded-2xl border border-slate-100 bg-white text-sm space-y-2">
              <Row label="Experience">
                {profile.years_experience != null
                  ? `${profile.years_experience} years`
                  : "—"}
              </Row>
              <Row label="Languages">
                {profile.languages.length > 0 ? profile.languages.join(", ") : "—"}
              </Row>
              <Row label="Travels up to">
                {profile.max_radius_km != null ? `${profile.max_radius_km} km` : "—"}
              </Row>
              <Row label="Country">{country}</Row>
            </div>
            <div className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50 text-sm text-emerald-900">
              <p className="font-medium">Vetted by SpecialCarer</p>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-emerald-900/90">
                <li>Identity verified</li>
                <li>Background check cleared</li>
                <li>Right-to-work confirmed</li>
              </ul>
            </div>
          </aside>
        </section>
      </article>
    </MarketingShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 text-right">{children}</dd>
    </div>
  );
}
