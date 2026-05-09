import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVettingSummary } from "@/lib/vetting/server";
import type { VettingSummary } from "@/lib/vetting/types";
import { TopBar } from "../../_components/ui";

export const dynamic = "force-dynamic";

type Step = {
  title: string;
  description: string;
  href: string;
  detail: string;
  done: boolean;
};

function buildSteps(s: VettingSummary): Step[] {
  return [
    {
      title: "Identity & background check",
      description: "Government ID + DBS / Checkr.",
      href: "/dashboard/verification",
      done: s.background_checks_complete,
      detail: s.background_checks_complete
        ? "All checks cleared."
        : "Start the checks.",
    },
    {
      title: "References",
      description: "Three referees.",
      href: "/dashboard/vetting/references",
      done: s.references.complete,
      detail: `${s.references.verified}/${s.references.total} verified`,
    },
    {
      title: "Certifications",
      description: "Upload certificates.",
      href: "/dashboard/vetting/certifications",
      done: s.certifications.verified > 0,
      detail: `${s.certifications.verified} verified · ${s.certifications.pending} pending`,
    },
    {
      title: "Skills assessment",
      description: "10-question quiz per vertical.",
      href: "/dashboard/vetting/skills",
      done: s.skills.has_any_pass,
      detail: s.skills.has_any_pass
        ? `Passed: ${s.skills.verticals_passed.join(", ")}`
        : "Pick a vertical.",
    },
    {
      title: "Video interview",
      description: "Three short answers.",
      href: "/dashboard/vetting/interview",
      done: s.interview.complete,
      detail: `${s.interview.approved}/${s.interview.required} approved`,
    },
    {
      title: "Onboarding course",
      description: "Six modules + checks.",
      href: "/dashboard/vetting/course",
      done: s.course.complete,
      detail: `${s.course.completed_modules}/${s.course.total} done`,
    },
  ];
}

export default async function MobileVettingHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/profile/vetting");
  const summary = await getVettingSummary(createAdminClient(), user.id);
  const steps = buildSteps(summary);

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Get vetted" back="/m/profile" />
      <div className="px-5 pt-3 space-y-3">
        <p className="text-[13px] text-subheading">
          Each step lives on the web dashboard — tap to open. Once you&rsquo;ve
          finished every step, your profile becomes publishable.
        </p>
        <ul className="space-y-3">
          {steps.map((s) => (
            <li
              key={s.title}
              className="rounded-card bg-white border border-line p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 inline-block w-3 h-3 rounded-full flex-none ${
                    s.done ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-heading">
                    {s.title}
                  </p>
                  <p className="text-[12px] text-subheading mt-0.5">
                    {s.description}
                  </p>
                  <p className="text-[11px] text-subheading mt-1">
                    {s.detail}
                  </p>
                </div>
                <Link
                  href={s.href}
                  className="text-[13px] font-bold text-primary"
                >
                  Open →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
