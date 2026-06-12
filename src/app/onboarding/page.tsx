import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";
import { SignupStep } from "./signup-step";
import Image from "next/image";

export const metadata = {
  title: "Welcome — SpecialCarers",
};

// Map the public-facing ?audience= value to the internal profile role.
// "carer" is the marketing term; "caregiver" is the role stored on profiles.
function audienceToRole(
  audience: string | undefined
): "seeker" | "caregiver" {
  return audience === "carer" || audience === "caregiver"
    ? "caregiver"
    : "seeker";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; audience?: string }>;
}) {
  const { next, audience } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Step 1 — unauthenticated sign-up. The audience is pre-selected and locked
  // from the ?audience= query param so carers landing from /become-a-caregiver
  // create a caregiver account without bouncing through /login first.
  if (!user) {
    const role = audienceToRole(audience);
    return (
      <main className="min-h-screen flex flex-col">
        <header className="px-6 py-5 border-b border-slate-100">
          <Link href="/" className="flex items-center gap-2 w-fit">
            <Image src="/brand/logo.svg" alt="SpecialCarers" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
        </header>

        <section className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-semibold tracking-tight">
              Create your account
            </h1>
            <p className="mt-2 text-slate-600">
              {role === "caregiver"
                ? "Apply in 5 minutes. Start with your details below."
                : "Tell us a little about you to get started."}
            </p>

            <div className="mt-8">
              <SignupStep role={role} next={next || "/onboarding"} />
            </div>

            <p className="mt-6 text-sm text-slate-500 text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-brand hover:text-brand-600 underline">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, country, role")
    .eq("id", user.id)
    .maybeSingle();

  // If already complete, skip onboarding.
  if (profile?.full_name && profile?.country) {
    redirect(next || "/dashboard");
  }

  // Step 2+ — authenticated profile completion. Default the role from the
  // locked audience when the profile trigger hasn't recorded one yet.
  const defaultRole = profile?.role ?? audienceToRole(audience);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Image src="/brand/logo.svg" alt="SpecialCarers" width={161} height={121} className="h-9 w-auto" priority />
        </Link>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-2 text-slate-600">
            Tell us a little about you so we can show you the right things.
          </p>

          <div className="mt-8">
            <OnboardingForm
              defaultName={profile?.full_name ?? ""}
              defaultCountry={profile?.country ?? ""}
              defaultRole={defaultRole}
              next={next || "/dashboard"}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
