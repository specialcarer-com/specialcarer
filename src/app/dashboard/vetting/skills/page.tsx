import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  VERTICAL_LABEL,
  VERTICALS,
  type Vertical,
} from "@/lib/vetting/types";
import SkillsQuizClient from "./SkillsQuizClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Skills assessment — SpecialCarer" };

type Attempt = {
  vertical: Vertical;
  score: number;
  passed: boolean;
  attempted_at: string;
};

export default async function SkillsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/vetting/skills");

  const { data } = await supabase
    .from("carer_skills_attempts")
    .select("vertical, score, passed, attempted_at")
    .eq("carer_id", user.id)
    .order("attempted_at", { ascending: false });
  const attempts = (data ?? []) as Attempt[];

  // Latest attempt per vertical.
  const byVertical = new Map<Vertical, Attempt>();
  for (const a of attempts) {
    if (!byVertical.has(a.vertical)) byVertical.set(a.vertical, a);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Skills assessment</h1>
        <Link
          href="/dashboard/vetting"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to vetting
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Pick a vertical you want to be bookable for. 10 questions, 70% to
        pass. If you fail, there&rsquo;s a 24-hour cooldown before you can
        retake.
      </p>
      <ul className="grid sm:grid-cols-2 gap-3">
        {VERTICALS.map((v) => {
          const last = byVertical.get(v);
          return (
            <li key={v}>
              <SkillsQuizClient
                vertical={v}
                label={VERTICAL_LABEL[v]}
                lastScore={last?.score ?? null}
                lastPassed={last?.passed ?? null}
                lastAt={last?.attempted_at ?? null}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
