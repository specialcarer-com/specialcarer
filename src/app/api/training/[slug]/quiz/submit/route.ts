import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TRAINING_PASS_THRESHOLD,
  TRAINING_RETRY_COOLDOWN_MS,
  generateVerificationCode,
} from "@/lib/training/types";

export const dynamic = "force-dynamic";

type SubmittedAnswer = {
  question_id: string;
  selected_index: number;
};

type QuestionRow = {
  id: string;
  correct_index: number;
  sort_order: number;
};

/**
 * POST /api/training/[slug]/quiz/submit
 * Body: { answers: [{ question_id, selected_index }] }
 * - Server-side scoring against training_quiz_questions.
 * - Cooldown: 1 hour between attempts (except the first).
 * - Pass threshold: 80%.
 * - On first pass: set quiz_passed_at, ceu_credits_awarded, verification_code.
 *
 * Returns: { score, passed, correct_indices, ceu_awarded, certificate_url }
 */
export async function POST(
  req: Request,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const answers = (body as { answers?: SubmittedAnswer[] })?.answers;
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data: course } = await supabase
    .from("training_courses")
    .select("id, ceu_credits, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "course_not_found" }, { status: 404 });
  }

  // Ensure enrollment.
  let { data: enrollment } = await supabase
    .from("training_enrollments")
    .select("*")
    .eq("carer_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!enrollment) {
    const { data: created, error: insErr } = await supabase
      .from("training_enrollments")
      .insert({ carer_id: user.id, course_id: course.id })
      .select("*")
      .single();
    if (insErr || !created) {
      return NextResponse.json({ error: "enroll_failed" }, { status: 500 });
    }
    enrollment = created;
  }

  // Cooldown — only enforced on a not-already-passed enrollment.
  if (!enrollment.quiz_passed_at) {
    const { data: lastAttempt } = await supabase
      .from("training_quiz_attempts")
      .select("attempted_at")
      .eq("enrollment_id", enrollment.id)
      .order("attempted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastAttempt) {
      const ageMs =
        Date.now() - new Date(lastAttempt.attempted_at).getTime();
      if (ageMs < TRAINING_RETRY_COOLDOWN_MS) {
        const cooldownUntil = new Date(
          new Date(lastAttempt.attempted_at).getTime() +
            TRAINING_RETRY_COOLDOWN_MS,
        ).toISOString();
        return NextResponse.json(
          { error: "cooldown", cooldownUntil },
          { status: 429 },
        );
      }
    }
  }

  // Score against the canonical questions.
  const { data: questions } = await supabase
    .from("training_quiz_questions")
    .select("id, correct_index, sort_order")
    .eq("course_id", course.id)
    .order("sort_order", { ascending: true });
  const qList = (questions ?? []) as QuestionRow[];
  if (qList.length === 0) {
    return NextResponse.json({ error: "no_questions" }, { status: 500 });
  }

  const correctById = new Map(qList.map((q) => [q.id, q.correct_index]));
  const submittedById = new Map(
    answers.map((a) => [a.question_id, a.selected_index]),
  );

  let correct = 0;
  for (const q of qList) {
    const sel = submittedById.get(q.id);
    if (typeof sel === "number" && sel === q.correct_index) correct += 1;
  }
  const score = Math.round((correct / qList.length) * 100);
  const passed = score >= TRAINING_PASS_THRESHOLD;
  const correctIndices: Record<string, number> = {};
  for (const q of qList) correctIndices[q.id] = q.correct_index;

  await supabase.from("training_quiz_attempts").insert({
    enrollment_id: enrollment.id,
    score,
    passed,
    answers,
  });

  // Update enrollment counters; first-pass also stamps the cert fields.
  const update: Record<string, unknown> = {
    attempts: (enrollment.attempts ?? 0) + 1,
    quiz_best_score: Math.max(enrollment.quiz_best_score ?? 0, score),
  };
  let certificateUrl = enrollment.certificate_url ?? null;
  let ceuAwarded = Number(enrollment.ceu_credits_awarded ?? 0);

  if (passed && !enrollment.quiz_passed_at) {
    update.quiz_passed_at = new Date().toISOString();
    update.ceu_credits_awarded = course.ceu_credits;
    ceuAwarded = Number(course.ceu_credits);
    // Generate a unique 8-char verification code; retry once on
    // collision, which is astronomically unlikely.
    let code = generateVerificationCode();
    update.verification_code = code;
    certificateUrl = `/api/training/${course.slug}/certificate`;
    update.certificate_url = certificateUrl;

    const { error: upErr } = await supabase
      .from("training_enrollments")
      .update(update)
      .eq("id", enrollment.id);
    if (upErr && upErr.message?.toLowerCase().includes("verification_code")) {
      code = generateVerificationCode();
      update.verification_code = code;
      await supabase
        .from("training_enrollments")
        .update(update)
        .eq("id", enrollment.id);
    }
  } else {
    await supabase
      .from("training_enrollments")
      .update(update)
      .eq("id", enrollment.id);
  }

  return NextResponse.json({
    score,
    passed,
    correct_indices: correctIndices,
    ceu_awarded: passed ? ceuAwarded : 0,
    certificate_url: passed ? certificateUrl : null,
  });
}
