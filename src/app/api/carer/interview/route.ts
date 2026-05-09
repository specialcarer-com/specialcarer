import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  INTERVIEW_MAX_SECONDS,
  INTERVIEW_PROMPT_COUNT,
} from "@/lib/vetting/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("carer_interview_submissions")
    .select(
      "id, prompt_index, video_path, duration_seconds, status, rejection_reason, created_at, reviewed_at",
    )
    .eq("carer_id", user.id)
    .order("prompt_index", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ submissions: data ?? [] });
}

type Body = {
  prompt_index?: number;
  video_path?: string;
  duration_seconds?: number;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt_index = Number(body.prompt_index);
  if (
    !Number.isInteger(prompt_index) ||
    prompt_index < 0 ||
    prompt_index >= INTERVIEW_PROMPT_COUNT
  ) {
    return NextResponse.json({ error: "invalid_prompt_index" }, { status: 400 });
  }
  const video_path = String(body.video_path ?? "").trim();
  if (!video_path || !video_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "invalid_video_path" }, { status: 400 });
  }
  const duration_seconds = Number.isFinite(body.duration_seconds)
    ? Math.round(Number(body.duration_seconds))
    : null;
  if (
    duration_seconds != null &&
    (duration_seconds < 1 || duration_seconds > INTERVIEW_MAX_SECONDS + 30)
  ) {
    return NextResponse.json({ error: "invalid_duration" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("carer_interview_submissions")
    .upsert(
      {
        carer_id: user.id,
        prompt_index,
        video_path,
        duration_seconds,
        // Re-uploads reset to pending so admin reviews the new take.
        status: "pending",
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
      },
      { onConflict: "carer_id,prompt_index" },
    )
    .select(
      "id, prompt_index, video_path, duration_seconds, status, created_at",
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ submission: data });
}
