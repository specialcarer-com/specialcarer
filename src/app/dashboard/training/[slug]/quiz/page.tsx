import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuizClient from "./QuizClient";

export const dynamic = "force-dynamic";

type QuestionRow = {
  id: string;
  prompt: string;
  options: string[];
  explanation: string | null;
};

export default async function QuizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/training/${slug}/quiz`);

  const { data: course } = await supabase
    .from("training_courses")
    .select("id, title")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) notFound();

  // We deliberately skip correct_index here; the client must not see it.
  const { data: questions } = await supabase
    .from("training_quiz_questions")
    .select("id, prompt, options, explanation")
    .eq("course_id", course.id)
    .order("sort_order", { ascending: true });

  const list = (questions ?? []) as QuestionRow[];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/training/${slug}`}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to course
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">
        Quiz: {course.title}
      </h1>
      <p className="text-sm text-slate-600">
        Pass with at least 80% (4 of 5). Retakes are allowed after a short
        cooldown (1 hour).
      </p>
      <QuizClient
        slug={slug}
        courseTitle={course.title}
        questions={list}
      />
    </div>
  );
}
