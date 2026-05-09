import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COURSE_MODULES_BY_KEY } from "@/lib/vetting/course-content";
import CourseModuleClient from "./CourseModuleClient";

export const dynamic = "force-dynamic";

export default async function CourseModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: key } = await params;
  const mod = COURSE_MODULES_BY_KEY[key];
  if (!mod) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/dashboard/vetting/course/${key}`);

  const { data } = await supabase
    .from("carer_course_progress")
    .select("read_at, knowledge_check_correct")
    .eq("carer_id", user.id)
    .eq("module_key", key)
    .maybeSingle<{ read_at: string | null; knowledge_check_correct: boolean | null }>();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{mod.title}</h1>
        <Link
          href="/dashboard/vetting/course"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← All modules
        </Link>
      </div>
      <article className="prose prose-slate max-w-none">
        {mod.bodyMarkdown.split(/\n\n+/).map((para, i) => (
          <p
            key={i}
            className="text-[15px] leading-relaxed text-slate-700"
            dangerouslySetInnerHTML={{ __html: renderInline(para) }}
          />
        ))}
      </article>
      <CourseModuleClient
        moduleKey={key}
        question={mod.question}
        options={[...mod.options]}
        initiallyRead={!!data?.read_at}
        previousCorrect={data?.knowledge_check_correct ?? null}
      />
    </div>
  );
}

/**
 * Tiny markdown-ish renderer: turns **bold** into <strong>. The body
 * content is hand-written and trusted, so we don't pull in a full
 * markdown parser.
 */
function renderInline(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
