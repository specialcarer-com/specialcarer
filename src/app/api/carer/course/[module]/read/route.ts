import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COURSE_MODULES_BY_KEY } from "@/lib/vetting/course-content";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  const { module: moduleKey } = await params;
  if (!COURSE_MODULES_BY_KEY[moduleKey]) {
    return NextResponse.json({ error: "invalid_module" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { error } = await supabase
    .from("carer_course_progress")
    .upsert(
      {
        carer_id: user.id,
        module_key: moduleKey,
        read_at: new Date().toISOString(),
      },
      { onConflict: "carer_id,module_key" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
