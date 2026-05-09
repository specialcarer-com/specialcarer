import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABEL } from "@/lib/training/types";
import CourseActions from "./CourseActions";

export const dynamic = "force-dynamic";

type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: "clinical" | "behavioural" | "operational" | "compliance";
  is_required: boolean;
  ceu_credits: number;
  video_url: string | null;
  video_provider: "embed" | "mp4" | "youtube";
  transcript_md: string | null;
  duration_minutes: number;
  country_scope: "UK" | "US" | "both";
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/training/${slug}`);

  const { data: course } = await supabase
    .from("training_courses")
    .select(
      "id, slug, title, summary, category, is_required, ceu_credits, video_url, video_provider, transcript_md, duration_minutes, country_scope",
    )
    .eq("slug", slug)
    .maybeSingle<Course>();
  if (!course) notFound();

  const { data: enrollment } = await supabase
    .from("training_enrollments")
    .select("video_completed_at, quiz_passed_at")
    .eq("carer_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();

  const watched = !!enrollment?.video_completed_at;
  const passed = !!enrollment?.quiz_passed_at;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/training"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to training
        </Link>
        <span className="text-xs text-slate-500">
          {CATEGORY_LABEL[course.category]} · {course.duration_minutes} min ·{" "}
          {Number(course.ceu_credits).toFixed(2)} CEU
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{course.title}</h1>
        <p className="text-sm text-slate-600 mt-1">{course.summary}</p>
      </div>

      {course.video_url && (
        <div
          className="relative w-full overflow-hidden rounded-2xl bg-black"
          style={{ paddingBottom: "56.25%" }}
        >
          <iframe
            src={course.video_url}
            title={course.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      )}

      <CourseActions
        slug={course.slug}
        alreadyWatched={watched}
        alreadyPassed={passed}
      />

      {course.transcript_md && (
        <article className="rounded-2xl bg-white border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Transcript
          </h2>
          <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {course.transcript_md}
          </div>
        </article>
      )}
    </div>
  );
}
