import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Welcome — SpecialCarer",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
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

  // If already complete, skip onboarding.
  if (profile?.full_name && profile?.country) {
    redirect(next || "/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold">
            S
          </div>
          <span className="font-semibold text-lg">SpecialCarer</span>
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
              defaultRole={profile?.role ?? "seeker"}
              next={next || "/dashboard"}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
