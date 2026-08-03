import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export const metadata = {
  title: "Welcome — SpecialCarer",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; preview?: string }>;
}) {
  const { next, preview } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, country, role")
    .eq("id", user.id)
    .maybeSingle();

  // If already complete, skip onboarding — unless ?preview=1 is set (design review bypass).
  const isPreview = preview === "1";
  if (profile?.full_name && profile?.country && !isPreview) {
    redirect(next || "/dashboard");
  }

  const { data: countryRows } = await supabase
    .from("countries")
    .select("code, name")
    .eq("enabled_for_signup", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  // Fall back to GB if the table is somehow empty (it is pre-seeded).
  const countries =
    countryRows && countryRows.length > 0
      ? countryRows
      : [{ code: "GB", name: "United Kingdom" }];

  return (
    <MarketingShell>
      <PageHeroBanner
        pageKey="account.onboarding"
        height="sm"
        tint="soft"
        overlay={
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/85">
              Welcome to SpecialCarer
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-white drop-shadow-sm">
              Let&rsquo;s set up your account
            </h1>
          </div>
        }
      />

      <section
        className="flex-1 px-6 py-12 sm:py-16"
        style={{ background: "#F7F3EA" }}
      >
        <div className="mx-auto w-full max-w-3xl">
          {/* Reassurance strip */}
          <ul className="mb-8 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                style={{ background: "#E6F5F5", color: "#016E70" }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10.5l3.5 3.5L16 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Vetted UK carers &amp; families
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                style={{ background: "#FDECD9", color: "#B9651A" }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 3l2.2 4.5 4.9.7-3.5 3.4.8 4.9L10 14.2l-4.4 2.3.8-4.9L3 8.2l4.9-.7L10 3z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
              Human support that actually replies
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                style={{ background: "#E6F5F5", color: "#016E70" }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 3l6 2v5c0 3.7-2.5 6.7-6 7.5-3.5-.8-6-3.8-6-7.5V5l6-2z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
              Your data, your control
            </li>
          </ul>

          {/* Form card */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
            <div
              aria-hidden
              className="h-1.5 w-full rounded-t-2xl"
              style={{
                background:
                  "linear-gradient(90deg, #039EA0 0%, #3FC6C8 55%, #F4A261 100%)",
              }}
            />
            <div className="p-6 sm:p-10">
              <div className="mb-6 sm:mb-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  A couple of quick questions
                </h2>
                <p className="mt-2 text-slate-600">
                  This helps us match you to the right care &mdash; or the
                  right families. Takes under a minute.
                </p>
              </div>

              <OnboardingForm
                defaultName={profile?.full_name ?? ""}
                defaultCountry={profile?.country ?? ""}
                defaultRole={profile?.role ?? "seeker"}
                countries={countries}
                next={next || "/dashboard"}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <span>Signed in as</span>
            <span className="font-medium text-slate-700">{user.email}</span>
            <span aria-hidden>·</span>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="underline hover:text-slate-700"
              >
                not you?
              </button>
            </form>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
