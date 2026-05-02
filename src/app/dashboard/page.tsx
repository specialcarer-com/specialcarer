import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Dashboard — SpecialCarer",
};

export default async function DashboardPage() {
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

  if (!profile?.full_name || !profile?.country) redirect("/onboarding");

  const isCaregiver = profile.role === "caregiver";

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold">
              S
            </div>
            <span className="font-semibold text-lg">SpecialCarer</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:inline">
              {user.email}
            </span>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-full border border-slate-200 text-sm hover:bg-slate-100 transition"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="flex-1 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
            {isCaregiver ? "Caregiver account" : "Seeker account"} ·{" "}
            {profile.country === "US" ? "United States" : "United Kingdom"}
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Welcome, {profile.full_name.split(" ")[0]}.
          </h1>
          <p className="mt-3 text-slate-600">
            Your account is set up. {isCaregiver
              ? "We're rolling out the caregiver application flow next — background checks, certification, and your first jobs."
              : "We're rolling out booking next. You'll be among the first to try it."}
          </p>

          {isCaregiver ? (
            <div className="mt-8 p-5 rounded-2xl bg-white border border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Payouts</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Connect a bank account so we can pay you for completed shifts.
                </p>
              </div>
              <Link
                href="/dashboard/payouts"
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition shrink-0"
              >
                Set up
              </Link>
            </div>
          ) : (
            <div className="mt-8 p-5 rounded-2xl bg-white border border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Find care</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Browse verified caregivers and book a shift.
                </p>
              </div>
              <Link
                href="/find-care"
                className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition shrink-0"
              >
                Browse
              </Link>
            </div>
          )}

          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-white border border-slate-100">
              <h2 className="font-semibold">Profile</h2>
              <dl className="mt-3 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Name</dt>
                  <dd>{profile.full_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Email</dt>
                  <dd className="truncate ml-4">{user.email}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Country</dt>
                  <dd>{profile.country === "US" ? "US" : "UK"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Role</dt>
                  <dd className="capitalize">{profile.role}</dd>
                </div>
              </dl>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-slate-100">
              <h2 className="font-semibold">What&rsquo;s next</h2>
              <ul className="mt-3 text-sm text-slate-600 space-y-2 list-disc pl-5">
                {isCaregiver ? (
                  <>
                    <li>Identity &amp; background check</li>
                    <li>Certifications and references</li>
                    <li>Set your services and availability</li>
                  </>
                ) : (
                  <>
                    <li>Add who you&rsquo;re booking for</li>
                    <li>Browse caregivers near you</li>
                    <li>Book your first session</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
