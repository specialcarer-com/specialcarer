import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCertificatePdf } from "@/lib/training/certificate";

export const dynamic = "force-dynamic";

/**
 * GET /api/training/[slug]/certificate
 * Generates a one-page A4 landscape PDF on the fly from the
 * enrollment + course + carer profile. 404 if not yet passed.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: course } = await supabase
    .from("training_courses")
    .select("id, title, ceu_credits")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "course_not_found" }, { status: 404 });
  }

  const { data: enrollment } = await supabase
    .from("training_enrollments")
    .select(
      "id, quiz_passed_at, ceu_credits_awarded, verification_code",
    )
    .eq("carer_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!enrollment || !enrollment.quiz_passed_at) {
    return NextResponse.json({ error: "not_passed" }, { status: 404 });
  }

  // Resolve carer name — prefer profiles.full_name, fall back to
  // user_metadata.
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  let carerName =
    (meta.full_name as string) || (meta.name as string) || "Caregiver";
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.full_name) carerName = profile.full_name;

  const pdf = await generateCertificatePdf({
    carerName,
    courseTitle: course.title,
    ceuCredits: Number(enrollment.ceu_credits_awarded ?? course.ceu_credits),
    passedAt: new Date(enrollment.quiz_passed_at),
    verificationCode: enrollment.verification_code ?? "PENDING",
  });

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="specialcarer-${slug}-certificate.pdf"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
