import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COURSE_MODULES_BY_KEY } from "@/lib/vetting/course-content";

export const dynamic = "force-dynamic";

type Body = { answer?: number };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  const { module: moduleKey } = await params;
  const mod = COURSE_MODULES_BY_KEY[moduleKey];
  if (!mod) {
    return NextResponse.json({ error: "invalid_module" }, { status: 400 });
  }
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
  if (
    !Number.isInteger(body.answer) ||
    (body.answer as number) < 0 ||
    (body.answer as number) >= mod.options.length
  ) {
    return NextResponse.json({ error: "invalid_answer" }, { status: 400 });
  }
  const correct = body.answer === mod.correctIndex;

  const { error } = await supabase
    .from("carer_course_progress")
    .upsert(
      {
        carer_id: user.id,
        module_key: moduleKey,
        knowledge_check_correct: correct,
        knowledge_check_attempted_at: new Date().toISOString(),
      },
      { onConflict: "carer_id,module_key" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    correct,
    correct_index: mod.correctIndex,
  });
}
