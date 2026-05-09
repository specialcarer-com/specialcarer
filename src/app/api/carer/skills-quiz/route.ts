import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SKILLS_COOLDOWN_HOURS,
  SKILLS_PASS_THRESHOLD,
  VERTICALS,
  type Vertical,
} from "@/lib/vetting/types";
import { SKILLS_QUESTIONS } from "@/lib/vetting/quiz-bank";

export const dynamic = "force-dynamic";

function isVertical(v: string): v is Vertical {
  return (VERTICALS as readonly string[]).includes(v);
}

/**
 * GET /api/carer/skills-quiz?vertical=elderly_care
 * Returns the question bank (without correctIndex) plus cooldown info.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const verticalRaw =
    new URL(req.url).searchParams.get("vertical")?.trim() ?? "";
  if (!isVertical(verticalRaw)) {
    return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
  }
  const vertical = verticalRaw;

  const { data: lastFail } = await supabase
    .from("carer_skills_attempts")
    .select("attempted_at, passed, score")
    .eq("carer_id", user.id)
    .eq("vertical", vertical)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ attempted_at: string; passed: boolean; score: number }>();

  const cooldownMs = SKILLS_COOLDOWN_HOURS * 3600_000;
  let cooldownUntil: string | null = null;
  if (lastFail && !lastFail.passed) {
    const ageMs = Date.now() - new Date(lastFail.attempted_at).getTime();
    if (ageMs < cooldownMs) {
      cooldownUntil = new Date(
        new Date(lastFail.attempted_at).getTime() + cooldownMs,
      ).toISOString();
    }
  }

  const questions = SKILLS_QUESTIONS[vertical].map(
    ({ correctIndex: _ci, explanation: _ex, ...rest }) => {
      void _ci;
      void _ex;
      return rest;
    },
  );
  return NextResponse.json({
    vertical,
    questions,
    last_attempt: lastFail
      ? {
          score: lastFail.score,
          passed: lastFail.passed,
          attempted_at: lastFail.attempted_at,
        }
      : null,
    cooldown_until: cooldownUntil,
    pass_threshold: SKILLS_PASS_THRESHOLD,
  });
}

type SubmitBody = {
  vertical?: string;
  answers?: number[];
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const verticalRaw = String(body.vertical ?? "").trim();
  if (!isVertical(verticalRaw)) {
    return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
  }
  const vertical = verticalRaw;
  const bank = SKILLS_QUESTIONS[vertical];
  if (
    !Array.isArray(body.answers) ||
    body.answers.length !== bank.length ||
    !body.answers.every(
      (n) => Number.isInteger(n) && n >= 0 && n < 100,
    )
  ) {
    return NextResponse.json({ error: "invalid_answers" }, { status: 400 });
  }

  // Cooldown enforcement.
  const { data: last } = await supabase
    .from("carer_skills_attempts")
    .select("attempted_at, passed")
    .eq("carer_id", user.id)
    .eq("vertical", vertical)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ attempted_at: string; passed: boolean }>();
  if (last && !last.passed) {
    const ageMs = Date.now() - new Date(last.attempted_at).getTime();
    if (ageMs < SKILLS_COOLDOWN_HOURS * 3600_000) {
      return NextResponse.json(
        { error: "cooldown" },
        { status: 429 },
      );
    }
  }

  let correct = 0;
  for (let i = 0; i < bank.length; i += 1) {
    if (body.answers[i] === bank[i].correctIndex) correct += 1;
  }
  const score = Math.round((correct / bank.length) * 100);
  const passed = score >= SKILLS_PASS_THRESHOLD;

  const { error } = await supabase.from("carer_skills_attempts").insert({
    carer_id: user.id,
    vertical,
    score,
    passed,
    answers: body.answers,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    score,
    passed,
    pass_threshold: SKILLS_PASS_THRESHOLD,
    correct,
    total: bank.length,
  });
}
