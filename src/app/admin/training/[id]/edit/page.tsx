import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import CourseForm, {
  type CourseFormValues,
  type QuestionFormValue,
} from "../../CourseForm";
import type {
  TrainingCategory,
  TrainingCountryScope,
  TrainingVertical,
  TrainingVideoProvider,
} from "@/lib/admin/training-validation";

export const dynamic = "force-dynamic";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  is_required: boolean;
  ceu_credits: number;
  video_url: string | null;
  video_provider: string;
  transcript_md: string | null;
  duration_minutes: number;
  country_scope: string;
  required_for_verticals: string[];
  sort_order: number;
  published_at: string | null;
};

type QuestionRow = {
  id: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  sort_order: number;
};

function normaliseQuestion(row: QuestionRow): QuestionFormValue {
  const opts = Array.isArray(row.options)
    ? (row.options as unknown[]).map((o) => (typeof o === "string" ? o : ""))
    : ["", "", "", ""];
  while (opts.length < 4) opts.push("");
  const four: [string, string, string, string] = [
    opts[0] ?? "",
    opts[1] ?? "",
    opts[2] ?? "",
    opts[3] ?? "",
  ];
  const ci = (row.correct_index >= 0 && row.correct_index <= 3
    ? row.correct_index
    : 0) as 0 | 1 | 2 | 3;
  return {
    prompt: row.prompt,
    options: four,
    correct_index: ci,
    explanation: row.explanation ?? "",
  };
}

export default async function EditTrainingCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();

  const { data: courseRow } = await admin
    .from("training_courses")
    .select(
      "id, slug, title, summary, category, is_required, ceu_credits, video_url, video_provider, transcript_md, duration_minutes, country_scope, required_for_verticals, sort_order, published_at",
    )
    .eq("id", id)
    .maybeSingle<CourseRow>();

  if (!courseRow) {
    notFound();
  }

  const { data: questionRows } = await admin
    .from("training_quiz_questions")
    .select("id, prompt, options, correct_index, explanation, sort_order")
    .eq("course_id", id)
    .order("sort_order", { ascending: true });

  const initialCourse: CourseFormValues = {
    slug: courseRow.slug,
    title: courseRow.title,
    summary: courseRow.summary,
    category: courseRow.category as TrainingCategory,
    is_required: courseRow.is_required,
    ceu_credits: courseRow.ceu_credits,
    video_url: courseRow.video_url ?? "",
    video_provider: courseRow.video_provider as TrainingVideoProvider,
    transcript_md: courseRow.transcript_md ?? "",
    duration_minutes: courseRow.duration_minutes,
    country_scope: courseRow.country_scope as TrainingCountryScope,
    required_for_verticals: courseRow.required_for_verticals as TrainingVertical[],
    sort_order: courseRow.sort_order,
  };

  const initialQuestions = (questionRows ?? []).map((q) =>
    normaliseQuestion(q as QuestionRow),
  );

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <Link
          href="/admin/training"
          className="text-slate-500 hover:text-slate-700"
        >
          ← Back to courses
        </Link>
      </div>
      <CourseForm
        mode="edit"
        courseId={id}
        initialCourse={initialCourse}
        initialQuestions={initialQuestions}
        initialPublishedAt={courseRow.published_at}
      />
    </div>
  );
}
