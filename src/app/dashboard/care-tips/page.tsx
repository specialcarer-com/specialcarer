import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultCareTipsSource } from "@/lib/care-tips/source";

export const dynamic = "force-dynamic";
export const metadata = { title: "Care tips — SpecialCarer" };

const VERTICAL_LABEL: Record<string, string> = {
  elderly_care: "Elderly",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex",
};

const MONTH = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default async function CareTipsArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/care-tips");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const audience: "seeker" | "caregiver" =
    profile?.role === "caregiver" ? "caregiver" : "seeker";

  const all = await defaultCareTipsSource.getAll();
  const filtered = all.filter(
    (t) => t.audience === audience || t.audience === "both",
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Dashboard
          </Link>
          <h1 className="text-sm font-medium text-slate-700">Care tips</h1>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-3xl font-semibold tracking-tight">
          All care tips
        </h2>
        <p className="mt-2 text-slate-600">
          Curated, seasonal advice for your role. Updated regularly.
        </p>

        <ul className="mt-8 grid sm:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="p-5 rounded-2xl bg-white border border-slate-100"
            >
              <h3 className="font-semibold text-slate-900">{t.title}</h3>
              <p className="mt-1 text-sm text-slate-700">{t.body}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.verticals.map((v) => (
                  <span
                    key={v}
                    className="text-[11px] font-medium text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-full"
                  >
                    {VERTICAL_LABEL[v] ?? v}
                  </span>
                ))}
                {t.months.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-full">
                    {t.months.map((m) => MONTH[m]).join(", ")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
