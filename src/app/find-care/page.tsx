import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function FindCarePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/find-care");

  const admin = createAdminClient();

  // Caregivers who have payouts enabled
  const { data: ready } = await admin
    .from("caregiver_stripe_accounts")
    .select(
      "user_id, country, charges_enabled, payouts_enabled, profiles!inner(full_name, role, country)"
    )
    .eq("payouts_enabled", true)
    .eq("charges_enabled", true);

  const candidateIds = (ready ?? [])
    .map((r) => r.user_id)
    .filter((id) => id !== user.id);

  // Restrict to caregivers whose required background checks are all cleared.
  // UK caregivers must have the uCheck bundle cleared; US caregivers must have
  // the Checkr bundle cleared.
  let clearedSet = new Set<string>();
  if (candidateIds.length > 0) {
    const { data: bgRows } = await admin
      .from("background_checks")
      .select("user_id, check_type, status")
      .in("user_id", candidateIds)
      .eq("status", "cleared");
    const ukRequired = [
      "enhanced_dbs_barred",
      "right_to_work",
      "digital_id",
    ];
    const usRequired = ["us_criminal", "us_healthcare_sanctions"];
    const cleared = new Map<string, Set<string>>();
    (bgRows ?? []).forEach((r) => {
      if (!cleared.has(r.user_id)) cleared.set(r.user_id, new Set());
      cleared.get(r.user_id)!.add(r.check_type);
    });
    clearedSet = new Set(
      (ready ?? []).filter((r) => r.user_id !== user.id).filter((r) => {
        const set = cleared.get(r.user_id);
        if (!set) return false;
        const required = r.country === "US" ? usRequired : ukRequired;
        return required.every((t) => set.has(t));
      }).map((r) => r.user_id)
    );
  }

  const caregivers = (ready ?? []).filter(
    (r) => r.user_id !== user.id && clearedSet.has(r.user_id)
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Dashboard
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight mt-2">Find care</h1>
      <p className="text-slate-600 mt-1">
        Caregivers who are verified and ready to take bookings.
      </p>

      {caregivers.length === 0 ? (
        <div className="mt-10 p-6 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-sm">
          No caregivers available yet. Check back soon — we&rsquo;re onboarding
          our first cohort.
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {caregivers.map((c) => {
            const profile = Array.isArray(c.profiles)
              ? c.profiles[0]
              : c.profiles;
            const name =
              (profile as { full_name?: string } | null)?.full_name ||
              "Caregiver";
            const country = c.country === "US" ? "United States" : "United Kingdom";
            return (
              <li
                key={c.user_id}
                className="p-5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <h2 className="font-medium">{name}</h2>
                  <p className="text-sm text-slate-500">{country}</p>
                </div>
                <Link
                  href={`/book/${c.user_id}`}
                  className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
                >
                  Book
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
