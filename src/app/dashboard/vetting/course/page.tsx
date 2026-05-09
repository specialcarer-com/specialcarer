import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COURSE_MODULES } from "@/lib/vetting/course-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding course — SpecialCarer" };

type Progress = {
  module_key: string;
  read_at: string | null;
  knowledge_check_correct: boolean | null;
};

function statusOf(p: Progress | undefined) {
  if (!p) return { tone: "todo", label: "Not started" };
  if (p.read_at && p.knowledge_check_correct === true)
    return { tone: "complete", label: "Complete" };
  if (p.read_at) return { tone: "in_progress", label: "Read · check pending" };
  return { tone: "todo", label: "Not started" };
}

const TONE: Record<string, string> = {
  complete: "bg-emerald-50 text-emerald-800 border-emerald-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  todo: "bg-slate-100 text-slate-600 border-slate-200",
};

export default async function CoursePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/vetting/course");
  const { data } = await supabase
    .from("carer_course_progress")
    .select("module_key, read_at, knowledge_check_correct")
    .eq("carer_id", user.id);
  const progress = (data ?? []) as Progress[];
  const byKey = new Map(progress.map((p) => [p.module_key, p]));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Onboarding course</h1>
        <Link
          href="/dashboard/vetting"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to vetting
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Six short modules. Read the material, then answer one knowledge-check
        question per module. You can come back any time.
      </p>
      <ul className="space-y-3">
        {COURSE_MODULES.map((m) => {
          const s = statusOf(byKey.get(m.key));
          return (
            <li
              key={m.key}
              className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{m.title}</p>
                <p className="text-sm text-slate-600 mt-0.5">{m.summary}</p>
              </div>
              <span
                className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${TONE[s.tone]}`}
              >
                {s.label}
              </span>
              <Link
                href={`/dashboard/vetting/course/${m.key}`}
                className="text-sm font-semibold text-slate-900 hover:underline"
              >
                Open →
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
