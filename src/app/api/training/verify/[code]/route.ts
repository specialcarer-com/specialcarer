import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/training/verify/[code]
 * Public — no auth. Looks up an enrollment by verification_code,
 * joins the course title and the carer's full name from profiles.
 * Returns the minimal information needed for a 3rd party (e.g.
 * a hiring family) to confirm the certificate is genuine.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const cleaned = (code || "").toUpperCase().slice(0, 8);
  if (!/^[A-Z0-9]{8}$/.test(cleaned)) {
    return NextResponse.json({ valid: false });
  }

  const admin = createAdminClient();
  const { data: enrollment } = await admin
    .from("training_enrollments")
    .select(
      "carer_id, course_id, quiz_passed_at, ceu_credits_awarded",
    )
    .eq("verification_code", cleaned)
    .maybeSingle();
  if (!enrollment || !enrollment.quiz_passed_at) {
    return NextResponse.json({ valid: false });
  }

  const [{ data: course }, { data: profile }] = await Promise.all([
    admin
      .from("training_courses")
      .select("title")
      .eq("id", enrollment.course_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", enrollment.carer_id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    valid: true,
    carer_name: profile?.full_name ?? "Caregiver",
    course_title: course?.title ?? "Course",
    ceu_credits: Number(enrollment.ceu_credits_awarded ?? 0),
    passed_at: enrollment.quiz_passed_at,
  });
}
