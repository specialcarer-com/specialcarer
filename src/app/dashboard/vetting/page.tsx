import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVettingSummary } from "@/lib/vetting/server";
import type { VettingSummary } from "@/lib/vetting/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get vetted — SpecialCarer" };

type Step = {
  key: string;
  title: string;
  description: string;
  href: string;
  status: "complete" | "in_progress" | "todo";
  detail: string;
};

function buildSteps(s: VettingSummary): Step[] {
  return [
    {
      key: "background",
      title: "Identity & background check",
      description: "Government ID + DBS (UK) or Checkr (US) review.",
      href: "/dashboard/verification",
      status: s.background_checks_complete ? "complete" : "todo",
      detail: s.background_checks_complete
        ? "All required checks cleared."
        : "Start the checks for your country.",
    },
    {
      key: "references",
      title: "References",
      description: "Three referees vouch for you. Verified by our team.",
      href: "/dashboard/vetting/references",
      status: s.references.complete
        ? "complete"
        : s.references.total > 0
          ? "in_progress"
          : "todo",
      detail: `${s.references.verified}/${s.references.total} verified · ${s.references.complete ? "minimum reached" : "need 2+ verified"}`,
    },
    {
      key: "certifications",
      title: "Certifications",
      description: "Upload at least one certificate so families can see your training.",
      href: "/dashboard/vetting/certifications",
      status: s.certifications.verified > 0
        ? "complete"
        : s.certifications.pending > 0
          ? "in_progress"
          : "todo",
      detail: `${s.certifications.verified} verified · ${s.certifications.pending} pending review`,
    },
    {
      key: "skills",
      title: "Skills assessment",
      description: "10-question quiz per care vertical. 70% to pass.",
      href: "/dashboard/vetting/skills",
      status: s.skills.has_any_pass ? "complete" : "todo",
      detail: s.skills.has_any_pass
        ? `Passed: ${s.skills.verticals_passed.join(", ")}`
        : "Pick a vertical to start.",
    },
    {
      key: "interview",
      title: "Video interview",
      description: "Three short recorded answers. Reviewed by our team.",
      href: "/dashboard/vetting/interview",
      status: s.interview.complete
        ? "complete"
        : s.interview.approved > 0
          ? "in_progress"
          : "todo",
      detail: `${s.interview.approved}/${s.interview.required} answers approved`,
    },
    {
      key: "course",
      title: "Onboarding course",
      description: "Six short modules + a knowledge check on each.",
      href: "/dashboard/vetting/course",
      status: s.course.complete
        ? "complete"
        : s.course.completed_modules > 0
          ? "in_progress"
          : "todo",
      detail: `${s.course.completed_modules}/${s.course.total} modules complete`,
    },
    {
      key: "profile",
      title: "Profile",
      description: "Photo, bio, languages, services, hourly rate.",
      href: "/dashboard/profile",
      status: "todo", // we don't gate on profile completeness server-side here
      detail: "Add a photo and a clear bio so families can choose you.",
    },
  ];
}

export default async function VettingHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/vetting");

  const summary = await getVettingSummary(createAdminClient(), user.id);
  const steps = buildSteps(summary);
  const completed = steps.filter((s) => s.status === "complete").length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Get fully vetted</h1>
        <p className="mt-1 text-sm text-slate-600">
          Families will only see your profile once you&rsquo;ve cleared every
          step below. {completed}/{steps.length} done.
        </p>
        {summary.is_fully_vetted ? (
          <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-sm">
            All steps complete. You can publish your profile from{" "}
            <Link className="underline" href="/dashboard/profile">your profile</Link>.
          </div>
        ) : null}
      </div>

      <ul className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.key}
            className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start gap-4"
          >
            <StatusDot status={s.status} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{s.title}</p>
              <p className="text-sm text-slate-600 mt-0.5">{s.description}</p>
              <p className="text-xs text-slate-500 mt-2">{s.detail}</p>
            </div>
            <Link
              href={s.href}
              className="text-sm font-semibold text-slate-900 hover:underline whitespace-nowrap"
            >
              {s.status === "complete" ? "Review" : "Continue →"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ status }: { status: Step["status"] }) {
  const cls =
    status === "complete"
      ? "bg-emerald-500"
      : status === "in_progress"
        ? "bg-amber-400"
        : "bg-slate-300";
  return (
    <span
      className={`flex-none mt-1.5 inline-block w-3 h-3 rounded-full ${cls}`}
      aria-hidden
    />
  );
}
