import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_LABEL,
  type CourseWithEnrollment,
  type TrainingCourse,
  type TrainingEnrollment,
} from "@/lib/training/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training & CEUs — SpecialCarer" };

type EnrollmentRow = TrainingEnrollment;

function statusOf(e: TrainingEnrollment | null): {
  tone: "todo" | "in_progress" | "passed";
  label: string;
} {
  if (!e) return { tone: "todo", label: "Not started" };
  if (e.quiz_passed_at) return { tone: "passed", label: "Passed" };
  if (e.video_completed_at)
    return { tone: "in_progress", label: "Quiz pending" };
  return { tone: "in_progress", label: "In progress" };
}

const TONE: Record<string, string> = {
  passed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  todo: "bg-slate-100 text-slate-600 border-slate-200",
};

export default async function TrainingHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/training");

  const { data: courses } = await supabase
    .from("training_courses")
    .select(
      "id, slug, title, summary, category, is_required, ceu_credits, video_url, video_provider, transcript_md, duration_minutes, country_scope, required_for_verticals, sort_order",
    )
    .order("sort_order", { ascending: true });
  const { data: enrollments } = await supabase
    .from("training_enrollments")
    .select(
      "id, carer_id, course_id, started_at, video_completed_at, quiz_passed_at, quiz_best_score, attempts, certificate_url, ceu_credits_awarded, verification_code",
    )
    .eq("carer_id", user.id);
  const enrollmentByCourse = new Map(
    ((enrollments ?? []) as EnrollmentRow[]).map((e) => [e.course_id, e]),
  );

  const list: CourseWithEnrollment[] = ((courses ?? []) as TrainingCourse[]).map(
    (c) => ({
      ...c,
      enrollment: enrollmentByCourse.get(c.id) ?? null,
    }),
  );

  // Current-year CEU total — read from the view.
  const year = new Date().getUTCFullYear();
  const { data: totalRow } = await supabase
    .from("carer_ceu_totals_v")
    .select("total_credits")
    .eq("carer_id", user.id)
    .eq("year", year)
    .maybeSingle();
  const ceuThisYear = totalRow ? Number(totalRow.total_credits) : 0;

  const required = list.filter(
    (c) => c.is_required && !c.enrollment?.quiz_passed_at,
  );
  const optional = list.filter(
    (c) => !c.is_required && !c.enrollment?.quiz_passed_at,
  );
  const completed = list.filter((c) => c.enrollment?.quiz_passed_at);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          Training &amp; continuing education
        </h1>
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 border border-teal-100 text-teal-800 px-3 py-1 text-sm font-semibold">
          {ceuThisYear.toFixed(2)} CEU credits in {year}
        </span>
      </div>
      <p className="text-sm text-slate-600">
        Watch a course, pass the 5-question quiz with at least 80%, and earn
        CEU/CPD credits with a verifiable certificate.
      </p>

      <Section title="Required" courses={required} emptyHint="No required courses outstanding." />
      <Section title="Optional" courses={optional} emptyHint="No optional courses available right now." />
      <Section title="Completed" courses={completed} emptyHint="Nothing completed yet." />

      <div className="pt-2">
        <Link
          href="/dashboard/training/certificates"
          className="text-sm font-semibold text-slate-900 hover:underline"
        >
          View all my certificates →
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  courses,
  emptyHint,
}: {
  title: string;
  courses: CourseWithEnrollment[];
  emptyHint: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
        {title} ({courses.length})
      </h2>
      {courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => {
            const s = statusOf(c.enrollment);
            return (
              <li
                key={c.id}
                className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{c.title}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{c.summary}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {CATEGORY_LABEL[c.category]} · {c.duration_minutes} min ·{" "}
                    {Number(c.ceu_credits).toFixed(2)} CEU
                  </p>
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${TONE[s.tone]}`}
                >
                  {s.label}
                </span>
                <Link
                  href={`/dashboard/training/${c.slug}`}
                  className="text-sm font-semibold text-slate-900 hover:underline"
                >
                  Open →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
