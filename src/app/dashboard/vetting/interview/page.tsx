import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { INTERVIEW_PROMPTS } from "@/lib/vetting/types";
import InterviewClient from "./InterviewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Video interview — SpecialCarer" };

type Submission = {
  prompt_index: number;
  video_path: string;
  duration_seconds: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

export default async function InterviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/vetting/interview");

  const { data } = await supabase
    .from("carer_interview_submissions")
    .select(
      "prompt_index, video_path, duration_seconds, status, rejection_reason, created_at",
    )
    .eq("carer_id", user.id);
  const submissions = (data ?? []) as Submission[];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Video interview</h1>
        <Link
          href="/dashboard/vetting"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to vetting
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Three short answers (60 seconds each). Records on your device, then
        uploads. Our team reviews each clip — usually within 48 hours.
      </p>
      <InterviewClient
        prompts={[...INTERVIEW_PROMPTS]}
        initial={submissions}
      />
    </div>
  );
}
